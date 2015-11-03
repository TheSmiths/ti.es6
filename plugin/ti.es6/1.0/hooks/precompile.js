var fs = require('fs')
var path = require('path')
var spawn = require('child_process').spawn
var utils = require('../utils')

/* Needed paths for the plugin */
var paths = {
      compiled: undefined,
      original: undefined
}

exports.cliVersion = ">=3.x"
exports.version = "1.0"
exports.init = function (logger, config, cli) {
    /* Handle brutal stops */
    process.on('SIGINT', function () {
        utils.cleanSync(paths.original, paths.compiled)
        process.exit(2)
    })
    process.on('exit', function () {
        utils.cleanSync(paths.original, paths.compiled)
    })

    /* Actually declare the hook */
    cli.on('build.pre.compile', executeSeq(logger, [
        prepare,
        transcompile,
        requirePolyfill,
        copyPolyfill
    ]))

    cli.on('build.post.compile', postCompile.bind(null, logger))
}

function executeSeq(logger, tasks) {
    var current = 0
    var errored = false

    return function task(data, terminate) {
        tasks[current](logger, data, function next(err, type) {
            if (err) {
                if (errored) { return }
                errored = true
                logger[type || 'error'](err)
                if (type && type !== 'error') {
                    return terminate()
                }
                return terminate(type && type !== 'error' ? undefined : "Unable to use ES6")
            }
            if (++current >= tasks.length) { return terminate() }
            task(data, terminate)
        })
    }
}

function prepare (logger, data, next) {
    /* Ensure the user wants to build for es6 */
    var propES6 = data.cli.tiapp.properties.es6 && data.cli.tiapp.properties.es6.value
    var optiES6 = data.cli.argv.$_.indexOf('--es6') !== -1
    if (!propES6 && !optiES6) { return next('ES6 not desired for this build.', 'info') }

    logger.info("Preparing project for ES6.")

    paths.compiled = path.join(data.cli.argv['project-dir'], 'app')
    paths.original = path.join(data.cli.argv['project-dir'], '.app')

    /* Backup the sources */
    utils.clean(paths.original, paths.compiled, function (e) {
        if (e) { return next(e) }
        utils.cp(paths.compiled, paths.original, next)
    })
}

function transcompile (logger, data, next) {
    /* Execute Babel on the copied sources */
    logger.info("Transpiling with Babel")
    var babelBin = path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'babel', 'bin', 'babel')
    var babel = spawn('node', [babelBin, paths.original, '--out-dir', paths.compiled])
    babel.on('exit', next)
    babel.stdout.on('data' , function (d) { logger.info(d)  })
    babel.stderr.on('data' , function (d) { logger.error(d)  })
    babel.stdout.on('error', function (e) { logger.error(e) })
}

function requirePolyfill (logger, data, next) {
    logger.info("Adding Polyfill features")
    /* Now, we've to read alloy.js and manually add a require to polyfill */
    var alloy = path.join(paths.compiled, 'alloy.js')
    fs.readFile(alloy, function (e, content) {
        if(e) { return next(e) }
        fs.writeFile(alloy, 'require("babel/polyfill");\n' + content.toString(), next)
    })
}

function copyPolyfill (logger, data, next) {
    /* Finally, create if it does not exist a lib/babel folder, and copy polyfill.js in it */
    logger.info("Copying polyfill library")
    var from = path.join(path.dirname(__dirname), 'lib', 'polyfill.js')
    var to = paths.compiled
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

function postCompile (logger, data, next) {
    logger.info("Cleaning ES6 artifacts")
    utils.clean(paths.original, paths.compiled, next)
}
