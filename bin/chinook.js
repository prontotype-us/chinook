#!/usr/bin/env node
// Generated by CoffeeScript 1.7.1
(function() {
  var Chinook, addAddress, address_containers, argv, async, command, connectToRedis, docker, ensureHostname, exports, getAllContainers, getFirstPort, hostnameKey, hostname_key_prefix, makeAddress, padRight, printAddresses, printAllAddresses, printAllContainers, redis, redis_address, redis_host, redis_port, removeAddress, util, _, _hostname, _id, _new_id, _old_id, _printAddresses;

  util = require('util');

  docker = new require('dockerode')({
    socketPath: '/var/run/docker.sock'
  });

  _ = require('underscore');

  argv = require('minimist')(process.argv);

  async = require('async');

  redis_address = (argv.redis || argv.r || 'localhost:6379').split(':');

  redis_host = redis_address[0];

  redis_port = redis_address[1];

  redis = null;

  connectToRedis = function(cb) {
    redis = require('redis').createClient(redis_port, redis_host);
    redis.on('ready', function() {
      return cb();
    });
    return redis.on('error', function() {
      console.log("[ERROR] Could not connect to Redis at " + (redis_address.join(':')));
      return process.exit();
    });
  };

  getFirstPort = function(net) {
    return _.keys(net.Ports)[0].split('/')[0];
  };

  makeAddress = function(net) {
    return 'http://' + net.IPAddress + ':' + getFirstPort(net);
  };

  hostname_key_prefix = 'frontend:';

  hostnameKey = function(hostname) {
    return hostname_key_prefix + hostname;
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
      if (l < 2) {
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
      output += 'HOSTNAME: ' + hostname;
      for (_i = 0, _len = addresses.length; _i < _len; _i++) {
        address = addresses[_i];
        output += '\n    ----> ';
        output += padRight(address, 30);
        if (container = address_containers[address]) {
          output += "[" + container.ShortId + "] " + container.Image;
        }
      }
      return cb(null, output);
    });
  };

  printAllAddresses = function(cb) {
    console.log('All assignments:');
    console.log('----------------');
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

  address_containers = {};

  getAllContainers = function(cb) {
    return docker.listContainers(function(err, containers) {
      return async.map(containers, function(container, _cb) {
        return docker.getContainer(container.Id).inspect(function(err, full_container) {
          container.Address = makeAddress(full_container.NetworkSettings);
          container.ShortId = container.Id.slice(0, 12);
          address_containers[container.Address] = container;
          return _cb(null, container);
        });
      }, cb);
    });
  };

  printAllContainers = function(cb) {
    console.log('All containers:');
    console.log('---------------');
    return getAllContainers(function(err, containers) {
      var container, _i, _len;
      for (_i = 0, _len = containers.length; _i < _len; _i++) {
        container = containers[_i];
        console.log(container.ShortId + '\t' + container.Image + '\t' + container.Address);
      }
      return cb();
    });
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

  Chinook.assignContainer = function(container_id, hostname, cb) {
    return docker.getContainer(container_id).inspect(function(err, container) {
      var container_address;
      if (err) {
        console.log(err);
      }
      container_address = makeAddress(container.NetworkSettings);
      console.log('  ASSIGN: [' + container_id + '] = ' + container_address);
      return ensureHostname(hostname, function() {
        return addAddress(hostname, container_address, cb);
      });
    });
  };

  Chinook.unassignContainer = function(container_id, hostname, cb) {
    return docker.getContainer(container_id).inspect(function(err, container) {
      var container_address;
      if (err) {
        console.log(err);
      }
      container_address = makeAddress(container.NetworkSettings);
      console.log('UNASSIGN: [' + container_id + '] = ' + container_address);
      return ensureHostname(hostname, function() {
        return removeAddress(hostname, container_address, cb);
      });
    });
  };

  Chinook.replaceContainer = function(old_container_id, new_container_id, hostname, cb) {
    return docker.getContainer(old_container_id).inspect(function(err, old_container) {
      var old_container_address;
      if (err) {
        console.log(err);
      }
      old_container_address = makeAddress(old_container.NetworkSettings);
      console.log('UNASSIGN: [' + old_container_id + '] = ' + old_container_address);
      return docker.getContainer(new_container_id).inspect(function(err, new_container) {
        var new_container_address;
        if (err) {
          console.log(err);
        }
        new_container_address = makeAddress(new_container.NetworkSettings);
        console.log('  ASSIGN: [' + new_container_id + '] = ' + new_container_address);
        return ensureHostname(hostname, function() {
          return removeAddress(hostname, old_container_address, function() {
            return addAddress(hostname, new_container_address, cb);
          });
        });
      });
    });
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
    } else if (command === 'replace') {
      _old_id = argv._[3];
      _new_id = argv._[4];
      _hostname = argv._[5] || argv.hostname || argv.h;
      console.log("Replacing container " + _old_id + " with " + _new_id + " for " + _hostname + "...");
      Chinook.prepare(function() {
        return Chinook.replaceContainer(_old_id, _new_id, _hostname, function() {
          return printAddresses(_hostname, function() {
            return process.exit();
          });
        });
      });
    } else if (command === 'assign') {
      _id = argv._[3];
      _hostname = argv._[4] || argv.hostname || argv.hostname || argv.h;
      console.log("Assigning container " + _id + " to " + _hostname + "...");
      Chinook.prepare(function() {
        return Chinook.assignContainer(_id, _hostname, function() {
          return printAddresses(_hostname, function() {
            return process.exit();
          });
        });
      });
    } else if (command === 'unassign') {
      _id = argv._[3];
      _hostname = argv._[4] || argv.hostname || argv.h;
      console.log("Unassigning container " + _id + " from " + _hostname + "...");
      Chinook.prepare(function() {
        return Chinook.unassignContainer(_id, _hostname, function() {
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
