# Skelly

![Skelly IRL](https://i.imgur.com/zRc3gpy.gif)

Skelly is one of the spookiest libraries available for doing scaffolding & templating of files according to some user-supplied parameters.

E.g., if all of your web components or models or etc follow some convention and boilerplate you might potentially save aggregate _minutes_ of time over one or two lifetimes by creating templates for them and running `skelly` to generate new instances.

## Templates
### Structure
In your project root (or wherever `package.json` lives), create a folder `.bones`.

In `.bones`, for each type of scaffolding you want to do, create a folder. For example, you might have `component` and `model` to create entities of those types based on their name. You can nest these. If you make one called `default`, `skelly` will go for it when no type is specified on the command line. It's optional.

For each type, you can add as many files and folders as you want representing output files. For the files, tack an extra `.js` on the end. If you want to generate `foo/config.ini`, make `$(type)/foo/config.ini.js`. Double up to `.js.js` when you're generating another JavaScript file.

If the path is dynamic based on the user input, you can name the file anything (`.js`) and utilize a slightly different syntax to define it.

### Definitions
The basic syntax for static files is:

```javascript
module.exports = (skelly, helpers) => skelly`<p>Hello, ${ 'name' }</p>`;
```

Pass your tagged template to skelly, and it fills it in based on user input.

If the file is always the same, you can just export a string directly:

```javascript
module.exports = '/** fill this out */';
```

To specify which information you want, you can provide  a string name for it and it will just prompt for that: `name?`

If you're feeling generous instead of a string you can supply an object fitting the format supported by [prompts](https://github.com/terkelg/prompts). This lets you do things like provide a longer description, a default value, a verification function, etc.

For dynamic paths where the name of the template does not match the desired name of the output file, instead return an array with two tagged templates, the first resolving to the filename and the second to the file content:
```javascript
module.exports = (skelly, helpers) => [
	skelly`views/${ 'name' }.html`,
	skelly`<p>Hello, ${ 'name' }</p>`
];
```
Template callbacks may be async.

#### Helpers
Helpers are functions that convert user input to forms suitable for the context in which they're being embedded. Supply these by changing the tag in your template to an array with helpers after the key. If there are more than one they'll be applied in order left-to-right.

```javascript
module.exports = (skelly, helpers) => skelly`<p>Hello ${
	[ 'name', str => str.toUpperCase(), str => str.split('').join('-') ]
}</p>`) // name = 'world', result = '<p>Hello W-O-R-L-D</p>
```

Since I often find myself needed snake_cased or camelCased or etc versions of a common input term, helpers includes all the utilities in [change-case](https://github.com/blakeembrey/change-case).

You can add your own helpers, in `.bones/helpers.js`. These become available to all your scaffolding types through the `helpers` parameter. Helpers are defined as a map:

`.bones/helpers.js`
```javascript
module.exports = {
	upper: str => str.toUpperCase(),
	dashed: str => str.split('').join('-')
}
```
After which the above can be:
```javascript
module.exports = (skelly, { upper, dashed }) => skelly`<p>Hello ${
	[ 'name', upper, dashed ]
}</p>`) // name = 'world', result = '<p>Hello W-O-R-L-D</p>
```

Helpers may be async.

#### Output
The final step in these template definitions is to define how you want the results to be output in `.bones/$(type)/output.skelly.js`.

In its simplest form you can return a base directory statically, if it always goes to the same place:
```javascript
module.exports = '/etc/my-daemon';
```

More likely the output depends on one or more of the parameters, so you can define a callback that returns a derived path:
```javascript
module.exports = (skelly, _helpers) => skelly`components/${ name }`; // relative to your package.json
```

You can also define your own arbitrary storage strategy by returning _another_ function.

The first parameter contains all the filled-in content of your templates, so you can also just do whatever you'd like with it here. Don't return a string (or a Promise resolving to a string) and Skelly won't attempt to write the output anywhere.

The secpmd parameter supplied to the nested function gives you everything the user entered while filling in the template, in case it's useful to access that directly:
```javascript
const db = require ('../../lib/db/redis');
module.exports = (_skelly, _helpers) => (output, _params) => Promise.all(
	Object.entries(output)
		.map(([ key, val ]) => db.set(key, val))
);
```

As demonstrated, output callbacks may be async.

## Running
It's recommended you add a script to your `package.json` with `"skelly": "skelly"`. Then you can run `npm run skelly -- $(type) $(prefill)`. Alternatively, `node_modules/.bin/skelly $(type) $(prefill)`

Type is the scaffold type, which can be omitted if there is a default type defined.

Prefill is an optional list of parameter values, which won't be prompted for if provided. You can use this to script Skelly in whole or part: `npm run skelly -- model --name Users`, e.g.

Any parameters not supplied in this way will be prompted for. If Skelly writes any files as a result of the run they'll be listed at the end.

You can pass `--force` or `-f` to overwrite files even when they already exist, but caveat emptor.

