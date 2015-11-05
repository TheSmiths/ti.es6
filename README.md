ti.es6 ![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)
======

This module is a plugin for Appcelerator Titanium CLI that brings es6 into an Alloy project.
It works thanks to `Babel` and `Polyfill` in order to transpile Alloy sources into fully a code
that is ES5-compatible.

### How to install it?

`npm install -g ti.es6`

### How to use it?

You can either add the option `--es6` with your build command:

`appc run --es6` or `ti build --es6`

or, you may also define a boolean property in your `tiapp.xml` and avoid giving the option each
time:

```xml
    ...
    <property name="es6" type="bool">true</property>
    ...
```

### Changelog

- 1.1 Avoid deleting and replacing original sources
- 1.0 First version
