#!/usr/bin/env node
// Generated by CoffeeScript 1.7.1
(function() {
  var Chinook, addAddress, address_containers, argv, async, command, connectToRedis, container_image_names, docker, ensureHostname, exports, formatProtoAddress, getAllContainers, getFirstPort, hostnameKey, hostname_key_prefix, makeContainerAddress, padRight, parseProtoAddress, printAddresses, printAllAddresses, printAllContainers, printAssigning, printUnassigning, redis, redis_address, redis_host, redis_port, removeAddress, util, _, _hostname, _new_proto_address, _old_proto_address, _printAddresses, _proto_address,
    __slice = [].slice;

  util = require('util');

  docker = new require('dockerode')({
    socketPath: '/var/run/docker.sock'
  });

  _ = require('underscore');

  argv = require('minimist')(process.argv);

  async = require('async');

  redis_address = (argv.redis || argv.r || ':').split(':');

  redis_host = redis_address[0] || 'localhost';

  redis_port = redis_address[1] || 6379;

  redis = null;

  connectToRedis = function(cb) {
    var redisFailed, redis_connected;
    redis = require('redis').createClient(redis_port, redis_host);
    redis_connected = false;
    redisFailed = function(err) {
      if (!redis_connected) {
        console.log("[ERROR] Could not connect to Redis at " + redis_host + ":" + redis_port);
      } else {
        console.log(err);
      }
      return process.exit();
    };
    redis.on('ready', function() {
      redis_connected = true;
      return cb();
    });
    return redis.on('error', redisFailed);
  };

  getFirstPort = function(net) {
    return _.keys(net.Ports)[0].split('/')[0];
  };

  makeContainerAddress = function(net) {
    return 'http://' + net.IPAddress + ':' + getFirstPort(net);
  };

  hostname_key_prefix = 'frontend:';

  hostnameKey = function(hostname) {
    return hostname_key_prefix + hostname;
  };

  parseProtoAddress = function(proto_address) {
    var address, proto;
    proto_address = proto_address.split('://');
    if (proto_address.length === 1) {
      proto = 'http';
      address = proto_address[0];
    } else {
      proto = proto_address[0];
      address = proto_address[1];
    }
    return [proto, address];
  };

  formatProtoAddress = function(proto, address) {
    if (address.match(/^:\d+$/)) {
      address = 'localhost' + address;
    }
    return proto + '://' + address;
  };

  padRight = function(s, n) {
    var s_;
    s_ = '' + s;
    while (s_.length < n) {
      s_ += ' ';
    }
    return s_;
  };

  ensureHostname = function(hostname, cb) {
    return redis.llen(hostnameKey(hostname), function(err, l) {
      if (l < 1) {
        return redis.rpush(hostnameKey(hostname), hostname, cb);
      } else {
        return cb();
      }
    });
  };

  addAddress = function(hostname, address, cb) {
    return removeAddress(hostname, address, function() {
      return redis.rpush(hostnameKey(hostname), address, cb);
    });
  };

  removeAddress = function(hostname, address, cb) {
    return redis.lrem(hostnameKey(hostname), 0, address, cb);
  };

  address_containers = {};

  container_image_names = {};

  getAllContainers = function(cb) {
    return docker.listContainers(function(err, containers) {
      return async.map(containers, function(container, _cb) {
        return docker.getContainer(container.Id).inspect(function(err, full_container) {
          container.Address = makeContainerAddress(full_container.NetworkSettings);
          container.ShortId = container.Id.slice(0, 12);
          address_containers[container.Address] = container;
          container_image_names[container.Id] = container.Image;
          return _cb(null, container);
        });
      }, cb);
    });
  };

  printAllContainers = function(cb) {
    console.log('Running containers:');
    console.log('------------------');
    return getAllContainers(function(err, containers) {
      var container, _i, _len;
      for (_i = 0, _len = containers.length; _i < _len; _i++) {
        container = containers[_i];
        console.log(padRight(container.ShortId, 16) + padRight(container.Image, 28) + container.Address);
      }
      return cb();
    });
  };

  printAddresses = function(hostname, cb) {
    return _printAddresses(hostname, function(err, output) {
      console.log(output);
      return cb();
    });
  };

  _printAddresses = function(hostname, cb) {
    return redis.lrange(hostnameKey(hostname), 1, -1, function(err, addresses) {
      var address, container, output, _i, _len;
      output = '';
      output += '  HOST: ' + hostname;
      for (_i = 0, _len = addresses.length; _i < _len; _i++) {
        address = addresses[_i];
        output += '\n    --> ';
        output += padRight(address, 32);
        if (container = address_containers[address]) {
          output += "[" + container.ShortId + "] " + container.Image;
        }
      }
      if (!addresses.length) {
        output += '\n      --- no assigned addresses';
      }
      return cb(null, output);
    });
  };

  printAllAddresses = function(cb) {
    console.log('Current assignments:');
    console.log('-------------------');
    return redis.keys(hostnameKey('*'), function(err, hostname_keys) {
      return async.mapSeries(hostname_keys, function(hk, _cb) {
        var h;
        h = hk.replace(RegExp('^' + hostname_key_prefix), '');
        return _printAddresses(h, _cb);
      }, function(err, outputs) {
        console.log(outputs.join('\n\n'));
        return cb();
      });
    });
  };

  printAssigning = function(address) {
    return console.log('      --+ ' + address);
  };

  printUnassigning = function(address) {
    return console.log('      --x ' + address);
  };

  Chinook = {};

  Chinook.prepare = function(cb) {
    return connectToRedis(function() {
      return getAllContainers(cb);
    });
  };

  Chinook.launchImage = function(cb) {
    console.error("NOT IMPLEMENTED");
    return cb();
  };

  Chinook.assign = function(proto, address, hostname, cb) {
    var assigner;
    if (assigner = Chinook.assigners[proto]) {
      return assigner(address, hostname, cb);
    } else {
      return Chinook.assignAddress(formatProtoAddress(proto, address), hostname, cb);
    }
  };

  Chinook.assignAddress = function(address, hostname, cb) {
    printAssigning(address);
    return ensureHostname(hostname, function() {
      return addAddress(hostname, address, cb);
    });
  };

  Chinook.assignContainer = function(container_id, hostname, cb) {
    return docker.getContainer(container_id).inspect(function(err, container) {
      var container_address;
      if (err) {
        console.log(err);
      }
      container_address = makeContainerAddress(container.NetworkSettings);
      printAssigning(container_address);
      return ensureHostname(hostname, function() {
        return addAddress(hostname, container_address, cb);
      });
    });
  };

  Chinook.assigners = {
    docker: Chinook.assignContainer
  };

  Chinook.unassign = function(proto, address, hostname, cb) {
    var unassigner;
    if (unassigner = Chinook.unassigners[proto]) {
      return unassigner(address, hostname, cb);
    } else {
      return Chinook.unassignAddress(formatProtoAddress(proto, address), hostname, cb);
    }
  };

  Chinook.unassignAddress = function(address, hostname, cb) {
    printUnassigning(address);
    return ensureHostname(hostname, function() {
      return removeAddress(hostname, address, cb);
    });
  };

  Chinook.unassignContainer = function(container_id, hostname, cb) {
    return docker.getContainer(container_id).inspect(function(err, container) {
      var container_address;
      if (err) {
        console.log(err);
      }
      container_address = makeContainerAddress(container.NetworkSettings);
      printUnassigning(container_address);
      return Chinook.unassignAddress(container_address, hostname, cb);
    });
  };

  Chinook.unassigners = {
    docker: Chinook.unassignContainer
  };

  Chinook.replace = function(old_proto_address, new_proto_address, hostname, cb) {
    return Chinook.unassign.apply(Chinook, __slice.call(old_proto_address).concat([hostname], [function() {
      return Chinook.assign.apply(Chinook, __slice.call(new_proto_address).concat([hostname], [cb]));
    }]));
  };

  Chinook.clearHostname = function(hostname, cb) {
    return redis.del(hostnameKey(hostname), cb);
  };

  if (require.main !== module) {
    exports = Chinook;
    console.log('TODO: assign connected redis client to exported chinook context');
  } else {
    command = argv._[2];
    if (command === 'launch') {
      Chinook.launchImage(function() {
        return process.exit();
      });
    } else if (command === 'assign') {
      _proto_address = parseProtoAddress(argv._[3]);
      _hostname = argv._[4] || argv.hostname || argv.hostname || argv.h;
      Chinook.prepare(function() {
        return Chinook.assign.apply(Chinook, __slice.call(_proto_address).concat([_hostname], [function() {
          return printAddresses(_hostname, function() {
            return process.exit();
          });
        }]));
      });
    } else if (command === 'unassign') {
      _proto_address = parseProtoAddress(argv._[3]);
      _hostname = argv._[4] || argv.hostname || argv.h;
      Chinook.prepare(function() {
        return Chinook.unassign.apply(Chinook, __slice.call(_proto_address).concat([_hostname], [function() {
          return printAddresses(_hostname, function() {
            return process.exit();
          });
        }]));
      });
    } else if (command === 'replace') {
      _old_proto_address = parseProtoAddress(argv._[3]);
      _new_proto_address = parseProtoAddress(argv._[4]);
      _hostname = argv._[5] || argv.hostname || argv.h;
      Chinook.prepare(function() {
        return Chinook.replace(_old_proto_address, _new_proto_address, _hostname, function() {
          return printAddresses(_hostname, function() {
            return process.exit();
          });
        });
      });
    } else if (command === 'clear') {
      _hostname = argv._[3];
      Chinook.prepare(function() {
        return Chinook.clearHostname(_hostname, function() {
          return printAllAddresses(function() {
            return process.exit();
          });
        });
      });
    } else {
      Chinook.prepare(function() {
        return printAllContainers(function() {
          console.log('');
          return printAllAddresses(function() {
            return process.exit();
          });
        });
      });
    }
  }

}).call(this);
