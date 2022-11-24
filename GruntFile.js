module.exports = function (grunt) {
  // Load plugins
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-sync');
  grunt.loadNpmTasks('grunt-bg-shell');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Init Config
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    // CleanUp build
    clean: {
      buildFolder: ['dist'],
    },

    // Copy files
    sync: {
      assets: {
        files: [{ cwd: 'src/assets', src: ['**'], dest: 'dist/assets/' }],
        verbose: true,
        failOnError: true,
        updateAndDelete: true,
      },
      meta: {
        files: [{ src: './package.json', dest: 'dist/meta.json' }],
      },
      templates: {
        files: [{ cwd: 'src/assets/templates', src: ['**'], dest: 'dist/assets/templates/' }],
        verbose: true,
        failOnError: true,
        updateAndDelete: true,
      },
    },

    // NonGrunt watcher
    bgShell: {
      _defaults: {
        bg: true,
      },

      // Typescript compiler
      tsc: {
        cmd: 'npx tsc -p tsconfig.build.json',
        bg: false,
      },

      // Typescript compiler + watch
      tscWatch: {
        cmd: 'npx tsc -w -p tsconfig.build.json',
      },

      // Restart server
      pm2: {
        cmd: 'npx pm2 startOrRestart pm2.config.js',
        bg: false,
      },

      // Restart server
      pm2Prod: {
        cmd: 'npx pm2 startOrRestart pm2.config.js --env production',
        bg: false,
      },
    },

    // Watch for file changes
    watch: {
      templates: {
        files: 'src/assets/template/**/*',
        tasks: ['sync:assets'],
      },
    },
  });
  grunt.event.on('watch', function (action, filepath, target) {
    grunt.log.writeln(target + ': ' + filepath + ' has ' + action);
  });

  // Register tasks
  grunt.registerTask('default', [
    'clean:buildFolder',
    'bgShell:tsc',
    'sync:assets',
    'sync:meta',
    'bgShell:tscWatch',
    'bgShell:pm2',
    'watch',
  ]);
  grunt.registerTask('production', [
    'clean:buildFolder',
    'bgShell:tsc',
    'sync:assets',
    'sync:meta',
    'bgShell:tscWatch',
    'bgShell:pm2Prod',
    'watch',
  ]);
  grunt.registerTask('build', ['clean:buildFolder', 'sync:assets', 'sync:meta', 'bgShell:parsLocales', 'bgShell:tsc']);
};
