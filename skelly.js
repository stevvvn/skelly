'use strict';

const fs = require('fs');
const prompts = require('prompts');
const argv = require('yargs').argv;
const caseUtils = require('change-case');
const { resolve, dirname } = require('path');
const mkdirp = require('mkdirp');
const { walk } = require('walk');

let utils = { ...caseUtils };

const ctx = { __baseDir: module.paths[0] };
async function skelly(strs, ...params) {
  const out = [];
  for (const [ idx, str ] of strs.entries()) {
    out.push(str);
    if (params[idx] === undefined) {
      break;
    }
    let param = params[idx];
    let helpers = [];
    if (Array.isArray(param)) {
      if (!param[0]) {
        console.error(param);
        throw new Error(`malformed parameter #${idx + 1}`);
      }
      [ param, ...helpers ] = param;
    }
    if (typeof param === 'string') {
      param = { name: param };
    }

    if (!ctx[param.name]) {
      if (argv[param.name]) {
        ctx[param.name] = argv[param.name];
      }
      else {
        ctx[param.name] = (await prompts({
          type: 'text',
          message: param.name,
          ...param
        }))[param.name];
      }
    }
    if (ctx[param.name] === undefined) {
      console.log('aborted');
      process.exit();
    }

    let val = ctx[param.name];
    for (const helper of helpers) {
      val = await helper(val);
    }
    out.push(val);
  }
  return out.join('');
}

const tplPath = resolve(`${ module.paths[0] }/../.bones/`);
if (!fs.existsSync(tplPath)) {
  console.error('no bones found');
  exit(1);
}
if (fs.existsSync(`${ tplPath }/helpers.js`)) {
  utils = { ...utils, ...require(`${ tplPath }/helpers`) };
}
const taskPath = `${ tplPath }/${ argv[0] || 'default' }`;
if (!fs.existsSync(taskPath)) {
  console.error(`no bones found in ${ taskPath }`);
  process.exit(1);
}

if (!fs.existsSync(`${ taskPath }/output.skelly.js`)) {
  console.error(`no output function provided in ${ taskPath }/output.skelly.js. this file should export a function that takes all the gathered parameters and output tree, and either returns a string base path for the output or does some persistences logic itself and returns undefined.`);
  process.exit(1);
}
const output = require(`${ taskPath }/output.skelly.js`);

const ignore = /^[.]|[.]skelly[.]js|(?<![.]js)$$/;
const walker = walk(taskPath);
const results = {};

walker.on('file', async (root, { name }, next) => {
  if (ignore.test(name)) {
    return next();
  }
  const relDir = root === taskPath ? '' : root.replace(`${ taskPath }/`, '');
  const res = await require(`${ root }/${ name }`)(skelly, utils);
  const destName = Array.isArray(res) ? await res[0] : name.replace(/[.]js$/, '');

  results[`${ relDir }/${ destName }`.replace(/^\//, '')] = Array.isArray(res) ? await res[1] : res;
  next();
});

walker.on('end', () => {
  const dest = typeof output === 'string' ? output : output(ctx, results);
  if (!dest) {
    return;
  }
  console.log(dest);
  const dirCache = {};
  Object.entries(results).forEach(([ path, content ]) => {
    const fname = `${ dest }/${ path }`;
    const dir = dirname(fname);
    if (!dirCache[dir]) {
      mkdirp(dir);
      dirCache[dir] = 1;
    }
    process.stdout.write(fname.replace(`${ dir }/`, '\t'));
    if (fs.existsSync(fname)) {
      console.log(' exists, skipping.');
      return;
    }
    fs.writeFileSync(fname, content);
    console.log(' .');
  });
});

(async () => {
  console.log(await skelly`<p>Hello ${ [ 'name', str => str.toUpperCase(), str => str.split('').join('-') ] }</p>`)
})();
