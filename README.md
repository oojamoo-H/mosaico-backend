[![herokubtn](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/goodenough/mosaico-backend/tree/stage)

# Mosaico Backend email builder

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Heroku server configuration](#heroku-server-configuration)
  - [buildpack](#buildpack)
  - [configuring environments variables](#configuring-environments-variables)
  - [Mail sending](#mail-sending)
  - [from email adress](#from-email-adress)
  - [MongoDB database](#mongodb-database)
  - [Admin password](#admin-password)
  - [Hostname](#hostname)
  - [AWS S3](#aws-s3)
  - [Branding](#branding)
  - [Other config](#other-config)
- [Dev prerequisite](#dev-prerequisite)
- [Updating the code](#updating-the-code)
  - [Build the project for *production*](#build-the-project-for-production)
  - [Start a server configured for *production*](#start-a-server-configured-for-production)
  - [Build and start a *production* server](#build-and-start-a-production-server)
  - [Build and start a *development* server](#build-and-start-a-development-server)
  - [Make a release](#make-a-release)
  - [Generating templates preview images](#generating-templates-preview-images)
  - [Databases scripts](#databases-scripts)
    - [sync-db](#sync-db)
    - [backup-db](#backup-db)
    - [local-db](#local-db)
  - [Tests](#tests)
  - [S3 notes](#s3-notes)
    - [requirements](#requirements)
    - [backing up to a local folder](#backing-up-to-a-local-folder)
    - [syncing a bucket from a local folder](#syncing-a-bucket-from-a-local-folder)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Mosaico backend

Ready to go backend for [Mosaico](http://mosaico.io) editor.

## INSTALL

Pre-requisites:
 - Node.js
 - MongoDB
 - SMTP server

```sh
npm run deps
npm run dev
```

Then go to: [http://localhost:7000](http://localhost:7000)

## Heroku server configuration

### buildpack

In order for the image resize & the templates' preview generation to work you will need those build packs IN THAT ORDER:

- https://github.com/alex88/heroku-buildpack-vips.git
- https://github.com/heroku/heroku-buildpack-apt
- https://github.com/captain401/heroku-buildpack-xvfb.git
- https://github.com/benschwarz/heroku-electron-buildpack.git
- heroku/nodejs

Copy and paste those urls in the `Buildpacks` section of `Settings`

This has to be done BEFORE any deploy

### configuring environments variables

- go in the settings of your application
- click on `settings`
- click on `Reveal Config Vars`
- variables name should follow this pattern :

```
backend_emailOptions__from
```

- always put `backend_` first
- then each level of config should be seperate with a double underscore: `__`
- see `.backendrc-example` on the master branch for the config requirements

below are the common environments variables you should want to set:


### Mail sending

```
backend_emailTransport__service         Mailjet
backend_emailTransport__auth__user      your Username (or API key)
backend_emailTransport__auth__pass      your password (or Secret Key)
```


backend_emailTransport__service is for [nodemailer-wellknown](https://www.npmjs.com/package/nodemailer-wellknown) configuration  


### from email adress


```
backend_emailOptions__from              Email Builder <emailbuilder@backend.com>
```

### MongoDB database

the path to your mongoDB instance

```
backend_database                        mongodb://localhost/backend
```

### Admin password

```
backend_admin__password                 a password of your choice
```

### Hostname

The domain name of your app

```
backend_host                            backend-test.herokuapp.com
```

### AWS S3

Those are the keys you should set for aws

```
backend_storage__type                   aws
backend_storage__aws__accessKeyId       20 characters key
backend_storage__aws__secretAccessKey   40 characters secret key
backend_storage__aws__bucketName        your bucket name
backend_storage__aws__region            region of your bucket (ex: ap-southeast-1)
```

###### getting AWS id

[console.aws.amazon.com/iam](https://console.aws.amazon.com/iam) -> **create new access key**

###### creating the bucket

[console.aws.amazon.com/s3](https://console.aws.amazon.com/s3) -> **create bucket**

you have also to set the good policy for the bucket:

**Properties** -> **Permissions** -> **Add bucket policy**

and copy and paste this:

```json
{
	"Version": "2008-10-17",
	"Statement": [
		{
			"Sid": "AllowPublicRead",
			"Effect": "Allow",
			"Principal": {
				"AWS": "*"
			},
			"Action": "s3:GetObject",
			"Resource": "arn:aws:s3:::YOURBUCKETNAME/*"
		}
	]
}
```

then replace `YOURBUCKETNAME` by your real bucket name


### Branding 

You can define here the main colors of the application:

- **contrast** colors are for the text laying upon the associated background-color
- **primary** is for the top navigation
- **accent** is for the buttons and links

```js
"brand": {
    "color-primary": "rgb(233,30,99)",
    "color-primary-contrast": "white",
    "color-accent": "#3f51b5",
    "color-accent-contrast": "white",
    "brandName": "My brand name"
},

```

### Other config

```js
// will print on the front some debug infos
debug:          false,
// redirect any http request to https
forcessl:       false,
images: {
  // needed only if not using S3 image storage
  uploadDir:    'uploads',
  // tmp directory name for image upload
  tmpDir:       'tmp',
  // cache resized images & add cache-control to image request
  cache:        false,
},
```

## Dev prerequisite

- [NodeJS 6](https://nodejs.org/en/)
- [MongoDB v3.2.7](https://www.mongodb.com/) (if installed locally `mongod` to start) (`brew install mongod` on mac)
- a SMTP server. [mailcatcher can help for local dev ](https://mailcatcher.me/) (`mailcatcher` to start) (`brew install ruby` relaunch terminal `gem install mailcatcher` on mac)
- [sharp](http://sharp.dimens.io/en/stable/) should work out the box most of the time. In case of troubles see [sharp installation instructions](http://sharp.dimens.io/en/stable/install/). MacOs will need XCode in order to compile.

You need to have:

- clone/fork the project
- in your terminal, go in the folder
- run `npm run deps` in the root folder

## Updating the code

It should have a default config for dev already setup.  
If you want to change some, create `.backendrc` at the root of the project then fill with the values you want to overrride as described in the `.backendrc-example`

those are the main developper commands:

### Build the project for *production*

```
npm run build
```

### Start a server configured for *production*

```
npm start
```

server will be running on `localhost:3000`

### Build and start a *production* server

```
npm run prod
```

### Build and start a *development* server

```
npm run dev
```

- server will be running on `localhost:7000`
- server will be restarted on files changes
- build will be updated on files changes also

### Make a release

on your current branch

```
npm run release
```

The release will be pushed in the branch you have chosen (dev/stage)  
Automatic deploy is configured in heroku. So **pushing to any branch will automatically been deployed to heroku**

### Generating templates preview images

see README.md

### Databases scripts

`.backendrc` should be provided with *dbConfigs* infos. See `.backendrc-example` for more informations

#### sync-db

- can copy one DB into another
- can also copy a snapshot saved in `images.tmpDir` (see below) into another

```
npm run sync-db
```

#### backup-db

- will save a snapshot of the specified DB in the folder defined by `images.tmpDir` config

```
npm run backup-db
```

#### local-db

- save a *local db* snapshot
- restore it later

```
npm run local-db
```

### Tests

Run all backoffice's tests:

- all the dev prerequisite
- having the application being build `npm run build`
- run the test with `npm run tape`

Run a specific test:

`./node_modules/.bin/tape tests/functional/authentification.js | ./node_modules/.bin/faucet`

### S3 notes

This is some script to backup a bucket or sync a bucket from a backup.  
This is mostly use for developement purpose.

#### requirements

- [aws cli](http://docs.aws.amazon.com/cli/latest/reference/) – `brew install awscli` on a mac
- `.backendc` filled with s3Configs parameters. See `.backendrc-example`

[more details about why we use the aws cli](http://stackoverflow.com/questions/17832860/backup-strategies-for-aws-s3-bucket#answer-32927276)

#### backing up to a local folder

```
npm run backup-s3
```

#### syncing a bucket from a local folder

```
npm run sync-s3
```
