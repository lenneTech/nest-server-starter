# Starter for lenne.Tech Nest Server

This is the starter kit for the [lenne.Tech Nest Server](https://github.com/lenneTech/nest-server).

It contains everything you need to get started right away and a few code examples to help you create your own modules.

In combination with Angular (see [lenne.Tech Angular example](https://github.com/lenneTech/angular-example)
incl. [ng-base](https://github.com/lenneTech/ng-base/tree/main/projects/ng-base/README.md)) the Nest Server is an ideal
basis for your next project.

For efficient handling we recommend using the [lenne.Tech CLI](https://github.com/lenneTech/cli) 
to initialize a new project and create modules and module elements.

This starter is regularly updated to the latest version of the Nest server. This makes it ideal for viewing the changes 
and applying them to your own project (see [Update Notes](update)).

[![License](https://img.shields.io/github/license/lenneTech/nest-server-starter)](/LICENSE)

## Requirements

- [Node.js incl. npm](https://nodejs.org):  
  the runtime environment for your server

- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git):  
  the version control system for your source code

- [MongoDB](https://docs.mongodb.com/manual/installation/#mongodb-community-edition-installation-tutorials)
  (or any other database compatible with [MikroORM](https://mikro-orm.io)):  
  the database for your objects

## 1. Install the starter kit via [CLI](https://github.com/lenneTech/cli)

```
$ npm install -g @lenne.tech/cli
$ lt server create <ServerName>
$ cd <ServerName>
```

## 2. Start the server

```
$ npm run start:dev
```

## 3. Extend the server

Since the server is based on [Nest](https://nestjs.com/), you can find all information about extending your server
in the [documentation of Nest](https://docs.nestjs.com/).

To create a new Module with model, inputs, resolver and service you can use the [CLI](https://github.com/lenneTech/cli):

```
$ lt server module <ModuleName>
```

We are currently working on a documentation of the extensions and auxiliary classes that the
[lenne.Tech Nest Server](https://github.com/lenneTech/nest-server) contains. As long as this is not yet available,
have a look at the [source code](https://github.com/lenneTech/nest-server/tree/master/src/core).
There you will find a lot of things that will help you to extend your server, such as:

- [GraphQL scalars](https://github.com/lenneTech/nest-server/tree/master/src/core/common/scalars)
- [Filter and pagination](https://github.com/lenneTech/nest-server/tree/master/src/core/common/args)
- [Decorators for restrictions and roles](https://github.com/lenneTech/nest-server/tree/master/src/core/common/decorators)
- [Authorisation handling](https://github.com/lenneTech/nest-server/tree/master/src/core/modules/auth)
- [Ready to use user module](https://github.com/lenneTech/nest-server/tree/master/src/core/modules/user)
- [Common helpers](https://github.com/lenneTech/nest-server/tree/master/src/core/common/helpers) and
  [helpers for tests](https://github.com/lenneTech/nest-server/blob/master/src/test/test.helper.ts)
- ...

## Further information

### Running the app

```bash
# Development
$ npm start

# Watch mode
$ npm run start:dev

# Production mode
$ npm run start:prod
```

### Test

```bash
# e2e tests
$ npm run test:e2e
```

Configuration for testing:
```
Node interpreter: /user/local/bin/node
Jest package: FULL_PATH_TO_PROJECT_DIR/node_modules/jest
Working directory: FULL_PATH_TO_PROJECT_DIR
Jest options: --config jest-e2e.json --forceExit
```
see [E2E-Tests.run.xml](.run/E2E-Tests.run.xml)

## Debugging

Configuration for debugging is:
```
Node interpreter: /user/local/bin/node
Node parameters: node_modules/@nestjs/cli/bin/nest.js start --debug --watch
Working directory: FULL_PATH_TO_PROJECT_DIR
JavaScript file: src/main.ts
```
see [Debug.run.xml](.run/Debug.run.xml)


## Test & debug the NestServer package in this project
Use [yalc](https://github.com/wclr/yalc) to include the NestJS server in the project.

1. clone [NestServer](https://github.com/lenneTech/nest-server): `git clone https://github.com/lenneTech/nest-server.git`
2. go to the nest-server folder (`cd nest-server`), install the packages via `npm i` and start the nest server in watch & yalc mode: `npm run watch`
3. link the nest server live package to this project via `npm run link:nest-server` and start the server: `npm start`
4. unlink the nest-server live package and use the normal package again when you are done: `npm run unlink:nest-server`

## Documentation
The API and developer documentation can automatically be generated.

```bash
# generate and serve documentation
$ npm run docs
```

## Update
An update to a new Nest Sever version can be done as follows:

1. set the new Nest Server version in the package.json under `{dependencies: {"@lenne.tech/nest-server": "NEW_VERSON" }}`.
2. run `npm run update`
3. adjust project according to changes in git history from nest server
4. run tests via `npm run tests:e2e`, build via `npm run build` and start the server with `npm start` to check if everything is working

Since this starter is regularly updated, it is ideal as a template for the changes to be made in your own project. 
Simply compare the current version in the Git history of this starter with the version that was previously used in 
the project and adapt your own project accordingly.

## Planned enhancements:

- Documentation of extensions and auxiliary classes

## Thanks

Many thanks to the developers of [Nest](https://github.com/nestjs/nest)
and all the developers whose packages are used here.

## License

MIT - see LICENSE
