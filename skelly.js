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
const helpers = [];
async function skelly(strs, ...params) {
  const out = [];
  for (const [ idx, str ] of strs.entries()) {
    out.push(str);
    if (params[idx] === undefined) {
      break;
    }
	 let param = params[idx];
	 let transform = [];
    if (Array.isArray(param)) {
      if (!param[0]) {
        console.error(param);
        throw new Error(`malformed parameter #${idx + 1}`);
      }
      [ param, ...transform ] = param;
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
    for (const helper of transform) {
      val = await helper(val);
    }
    out.push(val);
  }
  return out.join('');
}

let tplPath = process.cwd();
while (!fs.existsSync(`${ tplPath }/.bones`)) {
	const prnt = resolve(`${ tplPath }/..`);
	if (prnt === tplPath) {
		console.error('no bones found in cwd or any of its parents');
		process.exit(1);
	}
	tplPath = prnt;
}
tplPath += '/.bones';
if (fs.existsSync(`${ tplPath }/helpers.js`)) {
  utils = { ...utils, ...require(`${ tplPath }/helpers`) };
}
const taskPath = `${ tplPath }/${ argv._[0] || 'default' }`;
if (!fs.existsSync(taskPath)) {
  console.error(`no bones found in ${ taskPath }`);
  process.exit(1);
}

if (!fs.existsSync(`${ taskPath }/output.skelly.js`)) {
  console.error(`no output function provided in ${ taskPath }/output.skelly.js. this file should export a function that takes all the gathered parameters and output tree, and either returns a string base path for the output or does some persistences logic itself and returns undefined.`);
  process.exit(1);
}
let output = require(`${ taskPath }/output.skelly.js`);
if (typeof output !== 'string') {
  output = output(skelly, helpers);
}

const ignore = /^[.]|[.]skelly[.]js|(?<![.]js)$$/;
const walker = walk(taskPath);
const results = {};

walker.on('file', async (root, { name }, next) => {
  if (ignore.test(name)) {
    return next();
  }
  const relDir = root === taskPath ? '' : root.replace(`${ taskPath }/`, '');
  let res = require(`${ root }/${ name }`);
  if (typeof res !== 'string') {
    res = await res(skelly, utils);
  }
  const destName = Array.isArray(res) ? await res[0] : name.replace(/[.]js$/, '');

  results[`${ relDir }/${ destName }`.replace(/^\//, '')] = Array.isArray(res) ? await res[1] : res;
  next();
});

walker.on('end', async () => {
  let dest = await output;
  if (typeof dest !== 'string') {
  	dest = dest(results, ctx);
  }
  if (!dest || typeof dest !== 'string') {
    return;
  }
  if (!/^\//.test(dest)) {
	dest = resolve(`${ tplPath }/../${ dest }`);
  }
  console.log(dest);
  const dirCache = {};
  Object.entries(results).forEach(async ([ path, content ]) => {
    const fname = `${ dest }/${ path }`;
    const dir = dirname(fname);
    if (!dirCache[dir]) {
		await new Promise((resolve, reject) => mkdirp(dir, (err) =>
			err ? reject(err) : resolve()
		));
      dirCache[dir] = 1;
    }
    process.stdout.write(fname.replace(`${ dir }/`, '\t'));
    if (!argv.f && !argv.force && fs.existsSync(fname)) {
      console.log(' exists, skipping.');
      return;
    }
    fs.writeFileSync(fname, content);
    console.log(' .');
  });
});
