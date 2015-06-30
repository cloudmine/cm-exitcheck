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

   1. Specify as many files as you want as arguments. Note that only files, not directories, are currently supported. If you run without arguments, you will get no output.

   1. Read the analysis of your exits or lack thereof.

* As a module:
   1. Require it.

   1. Use `cm-exitcheck.test_file` to test when you know a filename, and `cm-exitcheck.test_string` to test when you have the code in a string.

   1. Optionally, set your options in the second param. (Read more in **Output**.)

# Output
You can get output in one of two forms: a string, which is hopefully understandable to us humans, and some JSON, which is useful if you're using this as a sort of linter and want the line numbers as, well, numbers so you can embed messages into the editor.

Specifying the output type is currently only supported when using the module methods. To specify whether you want JSON output, include a second parameter in your call to `test_string` or `test_file`. This parameter should be an object with a `json` property, or it will be ignored. The property itself can be any truthy or falsey value.

**String Output:** Default output, and the only output for command line. Explains problems if they exist, also tells you if you are in the clear.

**JSON Output:** Returns an object with 5 arrays of nodes, with location information (and possibly more). The properties are as follows:

* `global_exits` an array of program-level calls to `exit` or a function that always calls `exit`
* `conditionals` an analysis of the conditionals (`if` & `switch`) which need exits
* `promises` an analysis of the promise-returning function calls which need exits
* `callbacks` an analysis of callbacks functions which need exits

Within the JSON output, there is some consitency among formatting. Apart from `global_exits`, which is just an array of objects with `range` and `loc` properties, the other three properties above look like this:

* `need_exits` an array of objects used to identify where exits are not, but should be. These are formatted uniquely to each type at the moment.
* `always_exits` a boolean of whether the code, well, always exits.
* `never_exits` a boolean of whether the code never exits.

The last two properties were included to help quickly identify outputs that be ignored. For example, if any of them have the `always_exit` set to true, then it doesn't matter to us what else is going on -- the code will always exit. Similarly, if all of them have `never_exit` set to true, then the logical thing to do is simply put an `exit()` call at the end of the code. These checks are done as the first step of string output, so you don't have to worry about sorting through too much irrelevant output.


# Author
Originally written by [Lucy Moss](mailto:thecoloryes@gmail.com). Development sponsored by [CloudMine](https://cloudmine.me).
