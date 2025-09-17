---
title: 'Fossil Web API Guide'
description: 'Example of a simple Web API in Crystal with Fossil.cr.'
pubDate: 'Aug 11 2025'
---

> [Medium.com edition](https://medium.com/@iljabarouski/fossil-web-api-guide-fb44661a2d4b)

Here is an example Web API in Crystal. Crystal itself provides all needed primitives for writing APIs, but some functionality has to be implemented. For these purpose many shards (Crystal-lang packages) exist.

When learning Crystal, I decided to create my own -- [Fossil.cr](https://scurrra.github.io/fossil/). The framework is inspired by [FastAPI](https://fastapi.tiangolo.com/): simple server and endpoints creation via Crystal's metaprogramming primitives. Now let's look at how to grow fossils.

# Server creation

`Fossil::Server` is just a wrapper around Crystal's `HTTP::Server`, and it provides a final request handler which traces API URLs. Other handlers can be passed to the initializer as `handlers` parameter. The downside of this solution is that handler for static files should be either on a separate server or it can not serve from the "." directory.

```crystal
require "fossil"

server = Fossil::Server.new handlers: [
  HTTP::ErrorHandler.new,
  HTTP::LogHandler.new,
]
```

Here, all API routes will start at root (`/`), but you probably would like to provide different entry point as `root_path` parameter.

```crystal
require "fossil"

server = Fossil::Server.new root_path: "api", handlers: [
  HTTP::ErrorHandler.new,
  HTTP::LogHandler.new,
]
```

# Endpoint creation

Endpoints are constructed automatically from functions that are annotated with `@[<HTTP-Method>]` annotation (GET, POST, PUT, HEAD, DELETE, PATCH, OPTIONS) by `method_added` hook. The method annotation must have an instance of `Fossil::Router` that will be processed by the function; the router is created via `server.root / "route_1/something"` in the example, i.e. you should have access to `server.root` or path tree node you want to extend.

> `server.root` already has `root_path` initializer parameter in it.

```crystal
@[GET(server.root / "route_1/something")]
def get_something
  return "Something"
end
```

*Note*: By default, this endpoint will return a response with `Content-Type` "application/json". If you want to return "text/plain", or something else, you can do it via the `@[ContentType]` annotation. Everything except of "application/json" will be simply printed to response, so to return XML you should manually serialize data into a string.

```crystal
@[GET(server.root / "route_1/something")]
@[ContentType("text/plain")]
def get_something
  return "Something"
end
```

# Request parameters

With Fossil.cr you can use path, query, form, file and body parameters.

## Path parameters

Path parameters can be of types Int (Int32), UUID (version is automatically detected), and String. To specify a path parameter, include `/@<param_name>:<param_type>/` into the path.

The name of a parameter should be associated with method's arguments, annotated with `@[Fossil::Param::Path]`. This can be done by either naming the argument with the same name or by providing it as annotation's parameter `name`.

```crystal
@[GET(server.root / "route_2/@int_path_param:int")]
@[ContentType("text/plain")]
def get_by_int_path_param(
  @[Fossil::Param::Path(name: "int_path_param")]
  id : Int32,
)
  return id
end
```

```crystal
@[GET(server.root / "route_2/@str_path_param:string")]
@[ContentType("text/plain")]
def get_by_int_path_param(
  @[Fossil::Param::Path]
  str_path_param : String,
)
  return str_path_param
end
```

## Query parameters

Query parameters are parsed by Crystal from URL. They should be associated with method's arguments, annotated with `@[Fossil::Param::Query]` the same way as path parameters but with option to specify `alias` parameter in the annotation.

```crystal
@[GET(server.root / "route_3/starts_with")]
def get_something_starts_with(
  @[Fossil::Param::Query(name: "starts_with", alias: "stw")]
  start : String,
)
  return start
end
```

In this example query parameter in the URL can be `starts_with`, `stw`, and `start`.

## Form parameters

Form parameters differs from query parameters only in annotation name -- `@[Fossil::Param::Form]`. In request form parameters are specified with `Content-Type` set to either "application/x-www-form-urlencoded" or "multipart/form-data".

```crystal
@[POST(server.root / "route_4")]
def post_a_form(
  @[Fossil::Param::Form]
  text : String,
)
  return text
end
```

## File parameters

File parameter is a special type of form parameters -- it can only be of "multipart/form-data" `Content-Type`. `@[Fossil::Param::File]` annotation can only specify it's name (as a form parameter, not actual filename; filename is inferred from form metadata).

```crystal
@[POST(server.root / "route_5")]
def post_a_file(
  @[Fossil::Param::File]
  file : File,
)
  return file.path
end
```

## Body parameters

An endpoint can have only one body parameter, so its name means nothing for us. Method's argument should be annotated with `@[Fossil::Param::Body]`. If a request has `Content-Type` "application/json" its body is automatically deserialized. Other content types should be passed to the endpoint function as a string and be parsed manually.

For the example I will use an example from Crystal's documentation on `JSON`.

```crystal
class Location
  include JSON::Serializable

  @[JSON::Field(key: "lat")]
  property latitude : Float64

  @[JSON::Field(key: "lng")]
  property longitude : Float64
end

class House
  include JSON::Serializable  
  property address : String
  property location : Location?
end

@[POST(server.root / "route_6/house")]
def build_house(
  @[Fossil::Param::Body]
  house : House
)
  return house
end

@[POST(server.root / "route_6/houses")]
def build_houses(
  @[Fossil::Param::Body]
  houses : Array(House)
)
  return houses
end
```

# Running a server

As `Fossil::Server` is a wrapper around `HTTP::Server`, for convenience and ease of use some methods can be called on a wrapper: `.bind` to `String` and `URI`, `.listen` to host and port, port or to bound address, and `.close`. So the created server can be run by

```crystal
server.listen 8081, true # `true` means that you can rebind to the port
```

# Conclusion

> I hope you will find this guide and the package itself useful.

- [Fossil.cr docs](https://scurrra.github.io/fossil/)
- [Fossil.cr github](https://github.com/Scurrra/fossil/)