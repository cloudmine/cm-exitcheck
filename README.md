# exitcheck
A utility for solving a specific version of the halting problem in Node.js code. By default only looks for calls to `exit()` (with or without parameters), *not* `process.exit()`. 

# Installation
```
npm install cm-exitcheck -g
```

Or, if you don't need the command line executable, 

```
npm install cm-exitcheck
```

# Usage
The tool can be used either on the command line or as a standard node module.

* As a command line utility:
   1. Use either the symlink `exitcheck` or `[path_to_install]/lib/index.js` as your command.

   1. Specify as many files as you want as arguments. Note that only files, not directories, are currently supported. Bad filenames will let you know.

   1. Read the analysis of your exits or lack thereof.

* As a module:
   1. Require it.

   1. Use `cm-exitcheck.test_file` to test when you know a filename, and `cm-exitcheck.test_string` to test when you have the code in a string.

   * Optionally, set your options in the second param. (Read more in **Output**.)

# Output
You can get output in one of two forms: a string, which is hopefully understandable to us humans, and some JSON, which is useful if you're trying to do something like imbed messages on specific lines of text editors and don't want to extract the lines using regex. Or something like that. 

Specifying the output type is currently only supported when using the module methods. To specify whether you want JSON output, include a second parameter in your call to `test_string` or `test_file`. This parameter should be an object with a `json` property, or it will be ignored. The property itself can be any truthy or falsey value.

**String Output:** Default output, and the only output for command line. Explains problems if they exist, also tells you if you are in the clear.

**JSON Output:** Returns an object with 5 arrays of nodes, with location information (and possibly more). The properties are as follows:

* `global_exits` program-level calls to `exit` or a function that always calls `exit`
* `exits` those conditions under which code exits
* `non_exits` those conditions under which the code doesn't exit
* `promises` all promises where something exits (not those that don't exit at all)
* `callbacks` all callbacks where something exits (not those where none exit)