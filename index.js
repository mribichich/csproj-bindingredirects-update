const path = require('path');
const fs = require('fs');
const glob = require('glob');
const {promisify} = require('util');
const xml2js = require('xml2js');
const {any, contains, keys, not, equals} = require('ramda');

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const parseString = promisify(xml2js.parseString);

function anyRestorePackages(xml) {
  return any(a => contains('RestorePackages', keys(a)), xml.Project.PropertyGroup);
}

function anyAutoGenerateBindingRedirects(xml) {
  return any(a => contains('AutoGenerateBindingRedirects', keys(a)), xml.Project.PropertyGroup);
}

function anyTarget(xml) {
  return xml.Project.Target && any(a => equals(a.$.Name, 'ForceGenerationOfBindingRedirects'), xml.Project.Target);
}

(async () => {
  const targetXml = `<Target Name="ForceGenerationOfBindingRedirects" AfterTargets="ResolveAssemblyReferences" BeforeTargets="GenerateBindingRedirects" Condition="'$(AutoGenerateBindingRedirects)' == 'true'">
  <PropertyGroup>
    <!-- Needs to be set in a target because it has to be set after the initial evaluation in the common targets -->
    <GenerateBindingRedirectsOutputType>true</GenerateBindingRedirectsOutputType>
  </PropertyGroup>
  </Target>`;
  const targetObj = await parseString(targetXml);

  glob(path.join(process.argv[2], 'src/**/*.csproj'), null, async (er, files) => {
    await asyncForEach(files, async file => {
      console.log(file);

      const content = await readFile(file);

      const xml = await parseString(content);

      // RestorePackages: [ 'true' ],
      // RestoreProjectStyle: [ 'PackageReference' ],
      // AutoGenerateBindingRedirects: [ 'true' ]

      if (not(anyRestorePackages(xml))) {
        xml.Project.PropertyGroup[0] = {...xml.Project.PropertyGroup[0], RestorePackages: ['true']};
      }

      if (not(anyAutoGenerateBindingRedirects(xml))) {
        xml.Project.PropertyGroup[0] = {...xml.Project.PropertyGroup[0], AutoGenerateBindingRedirects: ['true']};
      }

      if (not(anyTarget(xml))) {
        xml.Project = {...xml.Project, ...targetObj};
      }

      const builder = new xml2js.Builder();
      const xmlToSave = builder.buildObject(xml);

      await writeFile(file, xmlToSave);
    });
  });
})();
