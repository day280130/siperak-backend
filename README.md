# Express Backend Starterpack

This is my personal backend starterpack, but feel free to use it if you stumbled here and felt that this starterpack will suit your needs.

## Core Dependency Used

### 1. [Express JS][1] (Backend Framework)

Widely known as a versatile and minimalist backend framework for nodejs.

### 2. [Prisma ORM][2] (Database ORM)

Used for connecting and working with main database(s), RDBMS or DDBMS(MongoDB only).

### 3. [Zod][3] and [Validator.js][4] (Input Validation)

Preventing ugly input validation and sanitation codes.

### 4. [Memcached][5] (Memcached Key-Value Database Connector)

Memcached is used for caching and session store.

### 5. [Jsonwebtoken][6] (JWT tools)

For working with JWT.

### 6. [Dotenv-safe][7] (Loading .env into environment variables)

Making sure your .env contains all needed variables from .env.example and then load it to your environment.

### 7. [Cors][8], [Helmet][9], [Compression][10], and [Cookie-parser][11] (Parsing and Transforming Request)

Making sure requests are workable.

[1]: https://expressjs.com/
[2]: https://www.prisma.io/
[3]: https://zod.dev/
[4]: https://github.com/validatorjs/validator.js#readme
[5]: https://github.com/3rd-Eden/memcached#readme
[6]: https://github.com/auth0/node-jsonwebtoken#readme
[7]: https://github.com/rolodato/dotenv-safe#readme
[8]: https://github.com/expressjs/cors#readme
[9]: https://helmetjs.github.io/
[10]: https://github.com/expressjs/compression#readme
[11]: https://github.com/expressjs/cookie-parser#readme

## How to Use

### 1. Install the packages

Install the packages with `npm install` or `npm i`

### 2. Make .env File

Make your own _.env_ file and make variables according to the _.env.example_, or just copy _.env.example_ into _.env_ with `cp .env.example .env`. Then, fill the variables according to your needs.

### 3. Edit Prisma Schema

Edit the schema.prisma file to suit your needs. **DO NOT** delete the `User` model or _id_, _email_, _name_, and _password_ attributes in it. Well, you can delete _name_ but you have to edit a few codes in AuthHandlers.ts file later. Refer to this [link](https://www.prisma.io/docs/concepts/components/prisma-schema "Prisma's official docs for schema") for the details.

### 4. Run Prisma Migrate

Migrate your prisma schema to your database with `npx prisma migrate dev` and generate your prisma client file with `npx prisma generate`. Make sure you already fill the _DATABASE_URL_ variable in the _.env_.

### 5. Make Your Own Routes and Handlers

Make your own routes and handlers by following the already written Auth Routes and Handlers. Make sure to use _checkAuthorizedCsrfToken_ and _checkAccessToken_ middlewares for your protected routes.

## Folder Structures

### Configs Folder

For all your configs. Make sure to edit the Cookie and JWT Configs to suit your needs.

### Handlers Folder

For all your request handlers. **Make sure to add them to your routes file in the routes folder later**. You only need to handle bad requests error here, and add your own internal error handler in the _ErrorHandlers.ts_ then pass the error to it. Follow the example in the _AuthHandler.ts_. Make sure to use `satisfies` with `SuccessResponse` or `ErrorResponse` type from _HandlerHelper.ts_ for all your response body to enforce consistency. Example :

```typescript
res.status(200).json({
  status: 'success',
  message: 'your request responded successfully',
  datas: [
    {
      dataOneAttributeOne: 'some data',
    },
  ],
} satisfies SuccessResponse);
```

### Helpers Folder

For all your helpers or abstracted reusable logic. **DO NOT** put request handlers here. Also check out the already written helpers and use them whenever possible, especially the **Memcached**, and **Prisma** helpers. **DO NOT** instantiate your own memcached or prisma client.

### Middlewares Folder

For all your middlewares to use in your routes. **DO NOT** put final request handlers here.

### Routes Folder

For all your routes for your handlers and middlewares. **Make sure to add your routes to the _index.ts_ file later**.

## Authentication and Authorization Flow

This starterpack uses hybrid stateful + stateless auth pattern using JWT with access and refresh token, plus anti-CSRF token for CSRF protection with, again, hybrid synchronous and double submit pattern(well, kinda). Here is how to work with it :

### 1. Get CSRF Token

On your frontend startup, hit `auth/token` endpoint to get a csrf token in the response payload and a hashed csrf token as an httponly cookie. At this point, the csrf token is still considered _anonymous_ by the server and can't be used to query/mutate resource. However, this anonymous csrf token is needed to perform login or register action. Save this token in your frontend's localStorage since it is still usable as long as you are not logged out, and put this token in `x-csrf-token` header for further request. It is safe to store this token in the localStorage since attacker won't get the hashed version and can't authorized themself even if they get it.

### 2. Authenticate (Login/Register)

With the proper csrf token header set up, you can now login by hitting `auth/login` and putting proper email and password in the request payload. Or you can register by hitting `auth/register` and putting proper user data in the request payload. Either way, if the action succeded, you will get an access jwt token in the response payload and a refresh jwt token as an httponly cookie. At this point the csrf token will be considered _authorized_ by the server and can no longer be used to login or register. Save the access token **only in your frontend's volatile state and not anywhere else** since this token will give you access to server's resource if you also have the proper csrf token. It is okay to lose this token since it will expire in a short time anyway and you have to hit `auth/refresh` endpoint to get a new one. Put this token in the `authorization` header with bearer token pattern (e.g. `'Bearer token_goes_here'` <-- The space after `'Bearer'` is important).

### 3. Refreshing Session (Get A New Access Token)

If the access token has been expired or your frontend app just started up but not logged out before, then you need to hit `auth/refresh` instead of login or register to get an access token. It will check your refresh token, csrf token, and hashed csrf token and then give you a new csrf token and access token. **Do not forget to replace your old csrf token with the new one**. Please be noticed that the refresh token will be expired in 7 days if not used.

### 4. Logging Out

Hit the `auth/logout` endpoint to remove your session in the server. Your httponly refresh token and hashed csrf token cookie will also be removed automatically. **You have to remove your stored csrf token yourself**. Or not, since it will be replaced when you login/register anyway. Your choice.

### 5. Accessing Protected Server Resouce

If you already have the csrf token and access token, you can use it as instructed above to access server's resource.
