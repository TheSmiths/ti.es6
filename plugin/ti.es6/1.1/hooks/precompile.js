var fs = require('fs')
var path = require('path')
var spawn = require('child_process').spawn
var utils = require('../utils')

/* Needed paths for the plugin */
var paths = {}
var blacklist = ['Resources', 'build', 'README', 'LICENSE', 'node_modules']

exports.cliVersion = ">=3.x"
exports.version = "1.0"
exports.init = function (logger, config, cli) {
    /* Handle brutal stops */
    process.on('SIGINT', function () {
        paths.toProject && utils.cleanSync(paths.toProject)
        process.exit(2)
    })
    process.on('exit', function () {
        paths.toProject && utils.cleanSync(paths.toProject)
    })

    cli.on('build.pre.construct', executeSeq(logger, [
        prepare
    ]))

    cli.on('build.pre.compile', executeSeq(logger, [
        copyProject,
        transcompile,
        requirePolyfill,
        copyPolyfill,
        cleanResources,
        symlinkResources
    ]))

    cli.on('build.post.compile', executeSeq(logger, [
        cleanResources,
        copyCompiledResources,
        cleanProject
    ]))
}

function executeSeq(logger, tasks) {
    var current = 0
    var errored = false
    var es6 = null

    return function task(data, terminate) {
        /* No task are done if es6 isn't needed */
        if (es6 === null && data.cli) {
            var propES6 = data.cli.tiapp.properties.es6 && data.cli.tiapp.properties.es6.value
            var optiES6 = data.cli.argv.$_.indexOf('--es6') !== -1
            es6 = propES6 || optiES6
        }
        if (!es6) { return terminate() }
        tasks[current](logger, data, function next(err, type) {
            if (err) {
                if (errored) { return }
                errored = true
                logger[type || 'error'](err)
                return terminate(type && type !== 'error' ? undefined : "Unable to use ES6")
            }
            if (++current >= tasks.length) { return terminate() }
            task(data, terminate)
        })
    }
}

function prepare(logger, data, next) {
    logger.info("Setup project for ES6 transpiling")
    paths.fromProject = data.cli.argv['project-dir']
    paths.toProject = path.join(paths.fromProject, '.project')
    paths.fromSources = path.join(paths.fromProject, 'app')
    paths.toSources = path.join(paths.toProject, 'app')
    paths.fromResources = path.join(paths.fromProject, 'Resources')
    paths.toResources = path.join(paths.toProject, 'Resources')
    data.cli.argv.$_.push('--project-dir', paths.toProject)
    data.cli.argv['project-dir'] = paths.toProject
    utils.clean(paths.toProject, next)
}

function copyProject (logger, data, next) {
    logger.info("Preparing project for ES6.")
    fs.mkdir(paths.toProject, function (e) {
        if (e) { return next(e) }
        fs.readdir(paths.fromProject, function (e, files) {
            var n = files.length
            if (n === 0) { return next() }
            var after = function (e) {
                if (e) { return next(e) }
                if (--n === 0) { return next() }
            }
            files.forEach(function (f) {
                if (blacklist.indexOf(f) !== -1 || f.match(/^\..*/)) { return after() }
                utils.cp(path.join(paths.fromProject, f), path.join(paths.toProject, f), after)
            })
        })
    })
}

function transcompile (logger, data, next) {
    /* Execute Babel on the copied sources */
    logger.info("Transpiling with Babel")
    var babelBin = path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'babel', 'bin', 'babel')
    var babel = spawn('node', [babelBin, paths.toSources, '--out-dir', paths.toSources])
    babel.on('exit', next)
    babel.stdout.on('data' , function (d) { logger.info(d)  })
    babel.stderr.on('data' , function (d) { logger.error(d)  })
    babel.stdout.on('error', function (e) { logger.error(e) })
}

function requirePolyfill (logger, data, next) {
    logger.info("Adding Polyfill features")
    /* Now, we've to read alloy.js and manually add a require to polyfill */
    var alloy = path.join(paths.toSources, 'alloy.js')
    fs.readFile(alloy, function (e, content) {
        if(e) { return next(e) }
        fs.writeFile(alloy, 'require("babel/polyfill");\n' + content.toString(), next)
    })
}

function copyPolyfill (logger, data, next) {
    /* Finally, create if it does not exist a lib/babel folder, and copy polyfill.js in it */
    logger.info("Copying polyfill library")
    var from = path.join(path.dirname(__dirname), 'lib', 'polyfill.js')
    var to = paths.toSources
    fs.mkdir(to, function (e) {
        if (e && e.code !== 'EEXIST') { return next(e) }
        to = path.join(to, 'lib')
        fs.mkdir(to, function (e) {
            if (e && e.code !== 'EEXIST') { return next(e) }
            to = path.join(to, 'babel')
            fs.mkdir(to, function (e) {
                if (e && e.code !== 'EEXIST') { return next(e) }
                to = path.join(to, 'polyfill.js')
                utils.cp(from, to, next)
            })
        })
    })
}

function cleanResources (logger, data, next) {
    logger.info("Clean Resources")
    fs.lstat(paths.fromResources, function (e, stats) {
        if (!e && stats.isDirectory()) { return utils.clean(paths.fromResources, next) }
        if (!e && stats.isSymbolicLink()) { return fs.unlink(paths.fromResources, next) }
        if (e && e.code === 'ENOENT') { return next() }
        next(e)
    })
}

function symlinkResources (logger, data, next) {
    logger.info("Symlinking resources")
    fs.symlink(paths.toResources, paths.fromResources, next)
}

function cleanProject (logger, data, next) {
    logger.info("Cleaning ES6 artifacts")
    utils.clean(paths.toProject, next)
}

function copyCompiledResources (logger, data, next) {
    logger.info("Copying compiled resources")
    utils.cp(paths.toResources, paths.fromResources, next)
}
