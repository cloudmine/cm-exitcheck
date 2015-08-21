# exitcheck
A utility for solving a specific version of the halting problem in Node.js code. Currently only detects calls to `exit` (*not* `process.exit`) and any function which directly calls `exit`. Checks conditionals (`if` and `switch` statements), callbacks (with callback declared in code), and promises (that use the `q` library).

# Installation
```
npm install cm-exitcheck -g
```

If you don't need the command line executable, you can install without `-g` and ignore the warning that global install is preferred.

# Usage
The tool can be used either on the command line or as a standard node module.

* As a command line utility:
   1. Use either the symlink `exitcheck` or `[path_to_install]/lib/index.js` as your command.

   1. Specify as many files as you want as arguments. Note that only files, not directories, are currently supported. If you run without arguments, you will get no output.

   1. Read the analysis of your exits or lack thereof.

* As a module:
   1. Require it.

   1. Use `cm-exitcheck.test_file` to test when you know a filename, and `cm-exitcheck.test_string` to test when you have the code in a string.

   1. Optionally, set your options in the second param. 

# Options
Currently, you can only specify options when using the library as a module. Simply specify a second parameter to either `test_file` or `test_string`. The following options are supported:

* `json`: boolean, whether to return JSON
* `zero_index`: boolean, whether you want line numbers starting with 0 instead of 1

# Output
There are two types of output, string output and JSON output. Currently, the command line utility only supports string output, as it is the default.

## String Output
This output is simply a string with each error on a different line, or a message that there were no errors. The line numbers shown are one-indexed not zero-indexed. This output form is generally suggested for human consumption.

Output (when not "Hooray! Your code contains a global exit.") will look like `Line #: <Error message>` for each error found.

## JSON Output
This output is more complicated but also more detailed. It is generally only suggested when there is a need to consume line numbers as numbers, for example embedding this analysis in a code editor. The object is consutructed as follows:

```
{
  global_exit: <boolean>, 
  conditionals: {
    need_exits: [{
      line: <number>, 
      message: <string> 
    }, ...],
    always_exits: <boolean>, 
    never_exits: <boolean> 
  },
  callbacks: {
    need_exits: [{
      line: <number>,
      message: <string>
    }, ...],
    always_exits: <boolean>,
    never_exits: <boolean>
  },
  promises: {
    need_exits: [{
      line: <number>,
      message: string>
    }, ...],
    always_exits: <boolean>,
    never_exits: <boolean>
  }
}
```

Note that the `need_exits` arrays can be empty; if they're empty, nothing was determined to be wrong for that topic.

The `global_exit` boolean indicates whether there was a program-level exit call. 

For `always_exits` and `never_exits` properties, each indicate whether the grouping well, does what the property says. Note that if `always_exits` is true for any property, all other exit messages should be ignored, as they are no longer relevant. Similarly, if `never_exits` is true for all properties and `global_exit` is false, there will be nothing in the `need_exits` properties, but there is still an error. String formatted output returns "Your code never exits. Adding an \`exit\` call to the end of your code will prevent the process from hanging." in this case. In an editor, you may want to attach such a message to the last line of the code.

# Testing
Simply `make test` to run unit tests and linting with jshint. Note that the linter only spits out errors (no output from it is a good thing). Code coverage can be generated and opened in your browser with `make cov`.

# Author
Originally written by [Lucy Moss](mailto:thecoloryes@gmail.com). Development sponsored by [CloudMine](https://cloudmine.me).
