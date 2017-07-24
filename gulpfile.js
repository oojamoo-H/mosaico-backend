'use strict'

const gulp            = require('gulp')
const path            = require('path')
const $               = require('gulp-load-plugins')()
const browserSync     = require('browser-sync').create()
const { reload }      = browserSync
const lazypipe        = require('lazypipe')
const del             = require('del')
const merge           = require('merge-stream')
const args            = require('yargs').argv
const mainBowerFiles  = require('main-bower-files')
const _               = require('lodash')

const isWatch         = args.watch  === true
const isDev           = args.prod   !== true
const env             = isDev ? 'development' : 'production'
const { cyan }        = require('chalk')
const buildDir        = 'dist'

function onError(err) {
  $.util.beep()
  if (err.annotated)      { $.util.log(err.annotated) }
  else if (err.message)   { $.util.log(err.message) }
  else                    { $.util.log(err) }
  return this.emit('end')
}

$.util.log(
  'environment is', $.util.colors.magenta(env),
  'watch is', isWatch ? $.util.colors.magenta('enable') : 'disable'
)

function bump() {
  return gulp.src(['package.json', 'bower.json'])
  .pipe($.bump({
    version: args.pkg
  }))
  .pipe(gulp.dest('./'))
}
bump.description = `Bump versions on package.json and bower.json. Used only in release script`

////////
// CSS
////////

const autoprefixer  = require('autoprefixer')
const csswring      = require('csswring')

const cssProd       = lazypipe()
  .pipe( $.rename, filePath => filePath.basename = filePath.basename.replace('-dev', '') )
  .pipe( $.purgeSourcemaps )
  .pipe( $.postcss, [
    csswring({ removeAllComments: true })
  ] )

function cleanCss(cb) {
  if (isDev) return cb()
  return del([buildDir + '/*.css', buildDir + '/*.css.map'], cb)
}

function cssEditor() {
  return gulp
  .src( 'src/css/custom-editor.less' )
  .pipe( $.plumber(onError) )
  .pipe( $.sourcemaps.init() )
  .pipe( $.less() )
  .pipe( $.postcss([
    autoprefixer({ browsers: ['ie 10', 'last 2 versions'], }),
  ]) )
  .pipe( $.sourcemaps.write() )
  .pipe( $.rename('editor-dev.css') )
  .pipe( gulp.dest(buildDir) )
  .pipe( reload({stream: true}) )
  .pipe( $.if(!isWatch, cssProd()) )
  .pipe( $.if(!isWatch, gulp.dest(buildDir)) )
}

function cssApp() {
  return gulp
  .src( 'src/css-backend/index.styl' )
  .pipe( $.plumber(onError) )
  .pipe( $.sourcemaps.init() )
  .pipe( $.stylus({
    'include css': true,
  }) )
  .pipe( $.postcss( [
    autoprefixer({ browsers: ['ie 10', 'last 2 versions'], }),
  ]) )
  .pipe( $.replace('rgb(255,152,0)', 'var(--color-primary, var(--default-color-primary))') )
  .pipe( $.replace('rgb(68,138,255)', 'var(--color-accent, var(--default-color-accent))') )
  .pipe( $.sourcemaps.write() )
  .pipe( $.rename('app-dev.css') )
  .pipe( gulp.dest(buildDir) )
  .pipe( reload({stream: true}) )
  .pipe( $.if(!isWatch, cssProd()) )
  .pipe( $.if(!isWatch, gulp.dest(buildDir)) )
}

const css       = gulp.series( cleanCss, gulp.parallel(cssEditor, cssApp) )
css.description = `Build CSS for the mosaico editor and the app`

////////
// JS
////////

//----- LIBRARIES

function cleanLib(cb) {
  if (isDev) return cb()
  return del(buildDir, '/**/*.js')
}

function mosaicoLib() {
  const bowerfiles = mainBowerFiles({
    group:  'editor',
    overrides: {
      // tinymce has no main…
      tinymce: {
        main: 'tinymce.js',
      },
      // override for load image
      'blueimp-load-image': {
        main: 'js/load-image.all.min.js',
      },
    },
  })

  // Can't replace jQuery with newer version
  // https://github.com/jquery/jquery/issues/3181#issuecomment-226964470
  // => Uncaught TypeError: elem.getClientRects is not a function
  // .filter( name => !/bower_components\/jquery\/dist\/jquery\.js$/.test(name)  )
  // // replace old version of jQuery
  // bowerfiles.unshift( path.join(__dirname, './node_modules/jquery/dist/jquery.js') )

  const editorLibs = gulp
  .src( bowerfiles )
  .pipe( $.filter(['*.js', '**/*.js']) )
  .pipe( $.order([
    // reorganize files we want to concat
    'jquery.js',
    'knockout.js',
    'jquery-ui*.js',
    'load-image.all.min.js',
    'jquery.fileupload.js',
    'jquery.fileupload-process.js',
    'jquery.fileupload-image.js',
    'jquery.fileupload-validate.js',
    '*.js',
  ]) )
  .pipe( $.concat('lib-editor.js') )

  // only copy necessary tinymce plugins
  const tinymce = gulp.src( [
    'bower_components/tinymce/themes/modern/theme.js',
    'bower_components/tinymce/plugins/paste/plugin.js',
    'bower_components/tinymce/plugins/link/plugin.js',
    'bower_components/tinymce/plugins/hr/plugin.js',
    'bower_components/tinymce/plugins/lists/plugin.js',
    'bower_components/tinymce/plugins/textcolor/plugin.js',
    'bower_components/tinymce/plugins/colorpicker/plugin.js',
    'bower_components/tinymce/plugins/code/plugin.js',
  ], { base: 'bower_components/tinymce' } )

  return merge(editorLibs, tinymce)
  .pipe( $.if(!isDev, $.uglify()) )
  .pipe( gulp.dest(buildDir + '/lib') )
}

// Bundling libs is just a concat…
const editorLib       = gulp.series( cleanLib, mosaicoLib)
editorLib.description = `build JS for the mosaico editor and the app`

//----- MOSAICO APPLICATION

const browserify  = require('browserify')
const source      = require('vinyl-source-stream')
const vinylBuffer = require('vinyl-buffer')
const aliasify    = require('aliasify')
const shim        = require('browserify-shim')
const debowerify  = require('debowerify')
const babelify    = require('babelify')
const envify      = require('envify/custom')
const watchify    = require('watchify')

function jsMosaico() {
  let b = browserify({
    cache:        {},
    packageCache: {},
    debug:        true,
    entries:      ['./src/js/app.js', './build/templates.js'],
    standalone:   'Mosaico',
  })

  b.transform(aliasify, {
    "aliases": {
      "console": "console-browserify/index.js",
      "jsep": "jsep/src/jsep.js",
      "knockoutjs-reactor": "knockoutjs-reactor/src/knockout.reactor.js"
    }
  })
  b.transform( shim )
  b.transform( debowerify )
  // b.transform(babelify, {
  //   presets:      ['es2015'],
  // })
  b.transform( babelify.configure({
    presets:    ['es2015'],
    // Optional only regex - if any filenames **don't** match this regex
    // then they aren't compiled
    only:       /custom-/,
  }) )
  b.transform(envify({
    _:          'purge',
    NODE_ENV:   env,
    CUSTOM:     true,
    MOSAICO:    false,
  }))

  if (isWatch) {
    b = watchify( b )
    b.on('update', function () {
      $.util.log('bundle front app')
      bundleShare( b )
    })
  }

  return bundleShare(b)
}

function bundleShare(b) {
  return b.bundle()
  .on( 'error', onError )
  .pipe( source('editor.js') )
  .pipe( vinylBuffer() )
  .pipe( $.if(!isDev, $.stripDebug()) )
  .pipe( $.if(!isDev, $.uglify()) )
  .pipe(gulp.dest(buildDir))
}

const jsEditor        = gulp.series( templates, jsMosaico)
jsEditor.description  = `Bundle mosaico app, without libraries`

//----- MOSAICO'S KNOCKOUT TEMPLATES: see -> combineKOTemplates.js

const through       = require('through2')
const StringDecoder = require('string_decoder').StringDecoder
const decoder       = new StringDecoder('utf8')

function templates() {
  const templates = []
  function passThrough(file, encoding, cb) {
    var name    = path.basename(file.path);
    var name    = /^([^\.]*)/.exec(name)[1];
    var content = decoder.write(file.contents);
    content     = content.replace(/"/g , "\\x22");
    content     = content.replace(/(\r\n|\n|\r)/gm, "");
    content     = `  templateSystem.addTemplate("${ name }", "${ content }");`
    // content     = "  templateSystem.addTemplate(\"" + name + "\", \"" + content + "\");";
    templates.push(content)
    return cb(null)
  }
  function flush(cb) {
    var result  = "var templateSystem = require('../src/js/bindings/choose-template.js');\n";
    result      = result + "document.addEventListener('DOMContentLoaded', function(event) {\n";
    result      = result + templates.join('\n') + '\n';
    result      = result + "});\n";
    this.push(new $.util.File({
      cwd: './',
      base: './',
      path: 'templates.js',
      contents: new Buffer(result),
    }))
    return cb()
  }
  return gulp
  .src([
    'src/tmpl/*.html',
    // replace some original templates by custom ones
    'src/tmpl-custom/*.html',
    '!src/tmpl/gallery-images.tmpl.html',
  ])
  .pipe( through.obj(passThrough, flush) )
  // templates has to be build on “build” folder
  // they will be require by editor app application
  .pipe( gulp.dest('build') )
}

//----- HOME JS (rename for now)

const pugify = require('pugify')

function jsHome() {
  let b = browserify({
    cache:        {},
    packageCache: {},
    debug:        true,
    entries:      ['./src/js-user-backend/index.js']
  })
  .transform(babelify, {
    presets:      ['es2015'],
  })
  .transform(pugify.pug({
    pretty:       isDev,
    compileDebug: isDev,
  }))
  .transform(envify({
    _:            'purge',
    NODE_ENV:     env,
    LOG:          isDev,
  }))

  if (isWatch) {
    b = watchify(b)
    b.on('update', function () {
      $.util.log('bundle home app')
      bundleHome(b)
    })
  }
  return bundleHome(b)

}

function bundleHome( b ) {
  return b.bundle()
  .on( 'error', onError )
  .pipe( source('user.js') )
  .pipe( vinylBuffer() )
  .pipe( $.if(!isDev, $.uglify()) )
  .pipe( gulp.dest(buildDir) )
}

//----- ADMIN JS

function jsAdmin() {
  let b = browserify({
    cache:        {},
    packageCache: {},
    debug:        true,
    entries:      ['./src/js-admin-backend/index.js']
  })
  .transform(babelify, {
    presets:      ['es2015'],
  })
  .transform(envify({
    _:            'purge',
    NODE_ENV:     env,
    LOG:          isDev,
  }))

  if (isWatch) {
    b = watchify(b)
    b.on('update', function () {
      $.util.log('bundle admin app')
      bundleAdmin(b)
    })
  }
  return bundleAdmin(b)

}

function bundleAdmin(b) {
  return b.bundle()
  .on( 'error', onError )
  .pipe( source('admin.js') )
  .pipe( vinylBuffer() )
  .pipe( $.if(!isDev, $.uglify()) )
  .pipe( gulp.dest(buildDir) )
}

const js        = gulp.parallel( mosaicoLib, jsEditor, jsHome, jsAdmin )
js.description  = `build js for mosaico app and the for the rests of the application`

////////
// ASSETS
////////

//----- FONTS

function fonts() {
  return gulp
  .src( 'bower_components/font-awesome/fonts/*' )
  .pipe(gulp.dest('res/fa/fonts'))
}

const assets        = fonts
assets.description  = `Copy font-awesome in the right place`

//----- MAINTENANCE

const maintenanceFolder = 'server/views/maintenance-pages'

const cleanMaintenance  = cb => del([`${maintenanceFolder}/*.html`], cb )

function maintenance() {
  return gulp
  .src([`${maintenanceFolder}/*.pug`, `!${maintenanceFolder}/_*.pug`])
  .pipe($.pug())
  .pipe(gulp.dest( maintenanceFolder ))
}

//----- REVS

var crypto = require('crypto')

function rev() {
  let revs = []
  function sortByName( a, b ) {
    const nameA = a.name.toUpperCase()
    const nameB = b.name.toUpperCase()
    if (nameA < nameB) return -1
    if (nameA > nameB) return 1
    return 0
  }
  function passThrough(file, enc, callback) {
    var key         = path.relative(file.base, file.path)
    var md5         = crypto.createHash('md5')
    if (!file.contents) return callback(null)
    var hash        = md5.update( file.contents.toString() ).digest( 'hex' )
    revs.push({'name': '/' + key, hash})
    callback( null )
  }
  function flush( cb ) {
    const md5Object = {}
    // keep the json in alphabetical order
    revs.sort(sortByName).forEach( r => {
      md5Object[ r.name ] = r.hash
    })
    let file = new $.util.File({
      path:     'md5public.json',
      contents: new Buffer( JSON.stringify(md5Object,  null, ' ') ),
    })
    this.push( file )
    cb()
  }

  return gulp
  .src( [
    'dist/**/*.*',
    'res/**/*.*',
    '!res/lang/*.*',
    'node_modules/material-design-lite/*.js',
    'node_modules/material-design-icons-iconfont/dist/**/*.*',
  ] )
  .pipe( through.obj(passThrough, flush) )
  .pipe( gulp.dest('server') )

}

////////
// DEV
////////

const cleanTmp = cb => del( ['tmp/upload_*'], cb )

function toc() {
  return gulp.src('./BACKEND.md')
  .pipe($.doctoc({
    mode: "github.com",
  }))
  .pipe(gulp.dest('./'))
}
toc.description   = `Regenerate TOC for BACKEND.md`

const cleanAll    = cb => del( [ buildDir, 'build' ], cb )
const build       = gulp.series(
  cleanAll,
  gulp.parallel( editorLib, js, css, assets ),
  rev
)
build.description = `rebuild all assets`

const nodemonOptions = {
  script: 'server/workers.js',
  ext:    'js json',
  watch:  [
    'server/**/*.js',
    '.backendrc',
    'index.js',
    'res/lang/*.js',
    'shared/*.js',
  ],
}

let init = true
function nodemon(cb) {
  return $.nodemon(_.merge({
    env: {
      'NODE_ENV':     'development',
      'VIPS_WARNING': false,
    }
  }, nodemonOptions))
  .on('start', () => {
    // https://gist.github.com/sogko/b53d33d4f3b40d3b4b2e#comment-1457582
    if (init) {
      init = false;
      cb()
    }
  })
}

function bsAndWatch() {
  browserSync.init({
    proxy: 'http://localhost:3000',
    open: false,
    port: 7000,
    ghostMode: false,
  })

  gulp.watch(['server/views/*.jade', 'dist/*.js']).on('change', reload)
  gulp.watch([
    'src/css/**/*.less',
    'src/css-backend/**/*.styl'],     css )
  gulp.watch( ['src/tmpl/*.html', 'src/tmpl-custom/*.html'], templates )
}

let initProd = true

function nodemonProd(cb) {
  return $.nodemon(_.merge({env: { 'NODE_ENV': 'production' }}, nodemonOptions))
  .on('start', () => {
    if (initProd) {
      initProd = false
      cb()
    }
  })
}

function watchProdLike() {
  gulp.watch(['server/views/*.jade', 'dist/*.js']).on('change', reload)
  gulp.watch('src/css/**/*.less', cssApp )
}

gulp.task( 'css',  css )
gulp.task( 'css:editor', cssEditor )
gulp.task( 'css:app', cssApp )
gulp.task( 'js', js )
gulp.task( 'assets',  assets )
gulp.task( 'rev',  rev )
gulp.task( 'templates',  templates )
gulp.task( 'build', build )
gulp.task( 'maintenance', gulp.series( cleanMaintenance, maintenance) )
gulp.task( 'dev', gulp.series(
  build,
  nodemon,
  bsAndWatch
) )
gulp.task( 'prod',
  gulp.parallel( js, nodemonProd ),
  watchProdLike
)
gulp.task( 'bump', bump )
gulp.task( 'toc',  toc )
