var homeassistant = "homeassistant";
var devices = {};
var timer = false;
var loading = true;

exports.init = hassInit;

Object.prototype.merge = function (obj) {
	if (obj === undefined) return this;
	for (var attrname in obj) { this[attrname] = obj[attrname]; }
	return this;
}

String.prototype.fix = function() {
	return this.toLowerCase().replace(/[\(\)]/g, '').split(' ').join('_');
}

var analyze = function(obj, regexp, type, final) {
	if (!loading) return;
	var topic = obj.topic;
	var value = obj.value;
	var re = new RegExp(regexp.replace(/\//g, '\\/'));

	var found = topic.match(re);
	if (found) {
		var name = found[1];

		if (devices[name] === undefined) {
			devices[name] = {'config': {'name': name}, 'controls': {}}
		}

		if (type == 'config') {
			if (found[2] === undefined) {
				var info = JSON.parse(value);
				devices[name][type].merge(info);
			} else {
				devices[name][type][found[3]] = value;
			}
		} else {
			var control = found[2];
			if (devices[name][type][control] === undefined) {
				devices[name][type][control] = {}
			}
			if (found[4] === undefined) {
				var info = JSON.parse(value);
				for (var value_name in info) {
					devices[name][type][control][value_name] = info[value_name];
				}
			} else {
				devices[name][type][control][found[4]] = value;
			}
		}
	} else {
		log("notfound={}", topic);
	}

	if (timer) {
		clearTimeout(timer);
		timer = false
	}
	if (final) {
		timer = setTimeout(function() {
			loading = false;
		}, 1000);
	}
}

trackMqtt("/devices/+/meta", function(obj) {
	if (!loading) return;
	analyze(obj, '^/devices/([^/]+)/meta(/([^/]+))?$', 'config');
});
trackMqtt("/devices/+/meta/#", function(obj) {
	if (!loading) return;
	analyze(obj, '^/devices/([^/]+)/meta(/([^/]+))?$', 'config');
});
trackMqtt("/devices/+/controls/+/meta/#", function(obj) {
	if (!loading) return;
	analyze(obj, '^/devices/([^/]+)/controls/([^/]+)/meta(/([^/]+))?$', 'controls', true);
});

var add = {
	'general': function(device_name, config, control_name, control, opts) {
		var name = config['name'] !== undefined ? config['name'] : device_name;
		if (config['title'] !== undefined) {
			if (config['title']['en'] !== undefined) {
				name = config['title']['en'];
			} else if (config['title']['ru'] !== undefined) {
				name = config['title']['ru'];
			}
		}
		var device_class = control['type'];

		var id = [device_name.fix(), control_name.fix(), device_class.fix()].join('_');

		var base = '/devices/' + device_name + '/controls/';
		var topic = base + control_name;
		var hass_topic = homeassistant + '/' + opts['type'] + '/' + device_name.fix() + '/' + control_name.fix() + '/config';

		var hass_name = control_name;
		if (control['title'] !== undefined) {
			if (control['title']['en'] !== undefined) {
				hass_name = control['title']['en'];
			} else if (control['title']['ru'] !== undefined) {
				hass_name = control['title']['ru'];
			}
		}

		var json = {
			"device": {
				"identifiers": device_name,
				"manufacturer": "WirenBoard",
				"model": config['driver'],
				"name": name
			},
			"name": hass_name,
			"state_topic": topic,
			"unique_id": id,
			"object_id": id,
			"availability": [
				{
					"topic": topic + '/meta',
					"value_template": "{{ False if value == '' else True }}",
					"payload_not_available": false,
					"payload_available": true
				},
				{
					"topic": topic + '/meta/error',
					"value_template": "{{ True if value == '' else False }}",
					"payload_not_available": false,
					"payload_available": true
				}
			],
			"availability_mode": "latest"
		};

		// may be empty string (false)
		if (opts['command']) json["command_topic"] = base + opts['command'];
		if (opts['class']) json["device_class"] =  opts['class'];

		if (opts['brightness_state_topic']) {
			json['brightness_state_topic'] = base + opts['brightness_state_topic'];
			json['brightness_command_topic'] = base + opts['brightness_state_topic'] + '/on';
		}

		if (opts['color_temp_state_topic']) {
			json['color_temp_state_topic'] = base + opts['color_temp_state_topic'];
			json['color_temp_command_topic'] = base + opts['color_temp_state_topic'] + '/on';
		}

		if (opts['rgb_state_topic']) {
			json['rgb_state_topic'] = base + opts['rgb_state_topic'];
			json['rgb_command_topic'] = base + opts['rgb_state_topic'] + '/on';
		}

		if (opts['hs_state_topic']) {
			json['hs_state_topic'] = base + opts['hs_state_topic'];
			json['hs_command_topic'] = base + opts['hs_state_topic'] + '/on';
		}

		if (opts['unit']) {
			json["unit_of_measurement"] =  opts['unit'];
			json["state_class"] = "measurement";
		}

		if (opts['binary']) {
			json["payload_off"] = 0;
			json["payload_on"]  = 1;
		}

		if (control['min'] !== undefined) json["min"] = control['min'];
		if (control['max'] !== undefined) json["max"] = control['max'];

		['min', 'man', 'icon', 'state_class', 'payload_press', 'retain',
		'value_template', 'payload_on', 'payload_off',
		'rgb_value_template', 'rgb_command_template',
		'brightness_value_template', 'brightness_command_template',
		'brightness_scale', 'brightness_command_template',
		'max_mireds', 'min_mireds']
		.forEach(function(value){
			if (opts[value] !== undefined) json[value] = opts[value];
		});

		publish(hass_topic, JSON.stringify(json), 0, true);
	},

	'temperature': function(device_name, config, control_name, control, params) {
		var opts = {class:'temperature', unit: '°C', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'rel_humidity': function(device_name, config, control_name, control, params) {
		var opts = {class:'humidity', unit: '%', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'current': function(device_name, config, control_name, control, params) {
		var opts = {class:'current', unit: 'A', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'sound_level': function(device_name, config, control_name, control, params) {
		var opts = {unit: 'dBA', type: 'sensor', icon: 'mdi:volume-high', 'value_template': '{{ value | int }}'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'carbon_dioxide': function(device_name, config, control_name, control, params) {
		var opts = {class:'carbon_dioxide', unit: 'ppm', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'volatile_organic_compounds': function(device_name, config, control_name, control, params) {
		var opts = {class:'volatile_organic_compounds', unit: 'µg/m³', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'lux': function(device_name, config, control_name, control, params) {
		var opts = {class:'illuminance', unit: 'lx', type: 'sensor', 'value_template': '{{ value | int }}'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'voltage': function(device_name, config, control_name, control, params) {
		var opts = {class:'voltage', unit: 'V', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'power': function(device_name, config, control_name, control, params) {
		var opts = {class:'power', unit: 'W', type: 'sensor', icon: 'mdi:gauge'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'motion': function(device_name, config, control_name, control, params) {
		var opts = {class:'motion', type: 'binary_sensor', payload_on: 'ON', payload_off: 'OFF'};
		var level = 100;
		if (typeof control['motion_level'] !== undefined) level = control['motion_level'] + 0;
		opts["value_template"] = "{{ (int(value) >= " + level + ") | iif('ON', 'OFF') }}";

		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'frequency': function(device_name, config, control_name, control, params) {
		var opts = {class:'frequency', unit: 'Hz', type: 'sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'energy': function(device_name, config, control_name, control, params) {
		var opts = {class: 'energy', state_class: 'total_increasing', type: 'sensor', unit: 'kWh'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'moisture': function(device_name, config, control_name, control, params) {
		var opts = {class:'moisture', binary: true, type: 'binary_sensor'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'switch': function(device_name, config, control_name, control, params) {
		var opts = {binary: true, command: control_name + '/on', type: 'switch'};
		if (control['readonly'] !== undefined && control['readonly'] == true) {
			opts = {binary: true, type: 'binary_sensor'};
		}
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'light': function(device_name, config, control_name, control, params) {
		var opts = {binary: true, command: control_name + '/on', type: 'light'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'text': function(device_name, config, control_name, control, params) {
		var opts = {type: 'sensor'}.merge(params);
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'range': function(device_name, config, control_name, control, params) {
		var opts = {type: 'number', command: control_name + '/on'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'pushbutton': function(device_name, config, control_name, control, params) {
		var opts = {type: 'button', command: control_name + '/on', payload_press: true, retain: false};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},

	'siren': function(device_name, config, control_name, control, params) {
		var opts = {type: 'siren', binary: true, command: control_name + '/on'};
		add['general'](device_name, config, control_name, control, opts.merge(params));
	},
}

var db = {
	'default': function(device_name, config, obj) {
		for(control_name in obj['controls']) {
			var control = obj['controls'][control_name];
			if (control['type'] === undefined) continue;

			var type = control['type'];

			if (type == 'value' && (control_name.indexOf('Counter') > 0 )) {
				add['text'](device_name, config, control_name, control, {state_class: 'total_increasing', icon: 'mdi:counter'});
				continue;
			}

			if (type == 'value') {
				type = 'text';
			}

			if (add[type] === undefined) {
				log("device={} unknown type={}/{}", device_name, control_name, type);
				continue;
			}

			add[type](device_name, config, control_name, control);
		}
	},
	'wb-rules': {},
	'wb-w1': {},
	'wb-m1w2': {},
	'wb-adc': {},
	'wb-gpio': {},
	'wb-modbus': function(device_name, config, obj) {
		var module_name = device_name.split('_')[0].toLowerCase();

		if (db[module_name] === undefined) {
			log("device={} unknown module={}", device_name, module_name);
			return;
		}
		config['driver'] = config['driver'] + ' ' + module_name;
		if (typeof db[module_name] == 'function') {
			db[module_name](device_name, config, obj);
		} else if (typeof db[module_name] == 'string' &&
			typeof db[db[module_name]] == 'function') {
			db[db[module_name]](device_name, config, obj);
		} else {
			db['default'](device_name, config, obj);
		}
	},
	'wb-mr6c': {},
	'wb-mr6cv3': {},
	'wb-mr6cu': {},
	'wb-mdm3': function(device_name, config, obj) {
		for(control_name in obj['controls']) {
			var control = obj['controls'][control_name];
			if (control['type'] === undefined) continue;

			var type = control['type'];

			if (control_name.match(/K\d/)) {
				var idx = control_name.slice(-1);
				var channel = obj['controls']['Channel ' + idx];
				add['light'](device_name, config, control_name, control, {
					brightness_state_topic: 'Channel ' + idx,
					brightness_scale: channel['max']
				});
				continue;
			}

			if (control_name.match(/Channel \d/)) {
				continue;
			}

			if (type == 'value' && (control_name.indexOf('counter') > 0 )) {
				add['text'](device_name, config, control_name, control, {state_class: 'total_increasing', icon: 'mdi:counter'});
				continue;
			}

			if (type == 'value') {
				type = 'text';
			}

			if (add[type] === undefined) {
				log("device={} unknown type={}/{}", device_name, control_name, type);
				continue;
			}

			add[type](device_name, config, control_name, control);
		}
	},
	'wb-mwac': function(device_name, config, obj) {
		for(control_name in obj['controls']) {
			var control = obj['controls'][control_name];
			if (control['type'] === undefined) continue;

			var type = control['type'];

			if (control_name == 'Alarm') {
				add['siren'](device_name, config, control_name, control, {command: control_name + '/on', payload_on: 1, payload_off: 0, state_on: 1, state_off: 0});
				add['switch'](device_name, config, control_name, control);
				continue;
			}

			if (type == 'switch' && (control_name[0] == 'F')) {
				add['moisture'](device_name, config, control_name, control);
				continue;
			}

			if (type == 'switch' && (control_name[0] == 'S')) {
				add['switch'](device_name, config, control_name, control, {icon: 'mdi:water-pump'});
				continue;
			}

			if (type == 'value' && (control_name.indexOf('Counter') > 0 )) {
				add['text'](device_name, config, control_name, control, {state_class: 'total_increasing', icon: 'mdi:counter'});
				continue;
			}

			if (add[type] === undefined) {
				log("device={} unknown type={}/{}", device_name, control_name, type);
				continue;
			}

			add[type](device_name, config, control_name, control);
		}
	},
	'wb-map6s': function(device_name, config, obj) {
		for(control_name in obj['controls']) {
			var control = obj['controls'][control_name];
			if (control['type'] === undefined) continue;

			var type = control['type'];

			if (type == 'value') {
				if (control_name == 'Frequency') {
					add['frequency'](device_name, config, control_name, control);
					continue;
				}
				if (control_name.indexOf('AP energy') == 0) {
					add['energy'](device_name, config, control_name, control);
					continue;
				}
				if (control_name.indexOf('RP energy') == 0) {
					add['energy'](device_name, config, control_name, control, {unit: 'kVARh'});
					continue;
				}
				var opts = {};
				if (control_name.indexOf('P ') == 0) {
					opts['unit'] = 'W';
				}
				if (control_name.indexOf('Q ') == 0) {
					opts['unit'] = 'VAR';
					opts['icon'] = 'mdi:flash';
				}
				if (control_name.indexOf('S ') == 0) {
					opts['unit'] = 'V*A';
					opts['icon'] = 'mdi:flash';
				}

				if (control_name.indexOf('angle') >= 0) {
					opts['unit'] = '°';
					opts['icon'] = 'mdi:axis-arrow';
				}
				add['text'](device_name, config, control_name, control, opts);
				continue;
			}

			if (type == 'power_consumption') {
				add['energy'](device_name, config, control_name, control);
				continue;
			}

			if (add[type] === undefined) {
				log("device={} unknown type={}", device_name, type);
				continue;
			}

			add[type](device_name, config, control_name, control);
		}
	},
	'wb-msw-v3': function(device_name, config, obj) {
		for(control_name in obj['controls']) {
			var control = obj['controls'][control_name];
			if (control['type'] === undefined) continue;

			var type = control['type'];

			if (control_name.match(/(Red|Green) LED/)) {
				add['light'](device_name, config, control_name, control);
				continue;
			}

			if (control_name.match(/Buzzer/)) {
				add['switch'](device_name, config, control_name, control, {icon: 'mdi:bullhorn'});
				continue;
			}

			if (type == 'concentration') {
				if (control_name.indexOf('VOC') >= 0) {
					add['volatile_organic_compounds'](device_name, config, control_name, control);
					continue;
				}
				add['carbon_dioxide'](device_name, config, control_name, control);
				continue;
			}

			if (add[type] === undefined) {
				log("device={} unknown type={}-{}", device_name, control_name, type);
				continue;
			}

			add[type](device_name, config, control_name, control);
		}
	},
	'wb-led': function(device_name, config, obj) {
		for(control_name in obj['controls']) {
			var control = obj['controls'][control_name];
			if (control['type'] === undefined) continue;

			var type = control['type'];

			if (control_name.match(/Channel \d/)) {
				if (control_name.indexOf('Brightness') >= 0) {
					continue;
				}
				add['light'](device_name, config, control_name, control, {
					brightness_state_topic: control_name + ' Brightness',
					brightness_scale: 100,
				});
				continue;
			}

			if (control_name.indexOf('RGB') >= 0) {
				if (control_name == 'RGB Strip') {
					add['light'](device_name, config, control_name, control, {
						rgb_state_topic: 'RGB Palette',
						rgb_value_template: "{{ value.split(';') | join(',') }}",
						rgb_command_template: "{{ red }};{{ green }};{{ blue }}",
					});
				}
				continue;
			}

			if (control_name == 'CCT1 Temperature' ||
				control_name == 'CCT1 Brightness' ||
				control_name == 'CCT2 Temperature' ||
				control_name == 'CCT2 Brightness') {
				continue;
			}

			if (control_name == 'CCT1 (channels 1_2)' || control_name == 'CCT1') {
				add['light'](device_name, config, control_name, control, {
					color_temp_state_topic: 'CCT1 Temperature',
					brightness_state_topic: 'CCT1 Brightness',
					brightness_scale: 100,
					min_mireds: 0,
					max_mireds: 100
				});
				continue;
			}

			if (control_name == 'CCT2 (channels 3_4)' || control_name == 'CCT2') {
				add['light'](device_name, config, control_name, control, {
					color_temp_state_topic: 'CCT2 Temperature',
					brightness_state_topic: 'CCT2 Brightness',
					brightness_scale: 100,
					min_mireds: 0,
					max_mireds: 100
				});
				continue;
			}

			if (type == 'value' && (control_name.indexOf('Counter') > 0 )) {
				add['text'](device_name, config, control_name, control, {state_class: 'total_increasing', icon: 'mdi:counter'});
				continue;
			}

			if (type == 'value') {
				type = 'text';
			}

			if (add[type] === undefined) {
				log("device={} unknown type={}/{}", device_name, control_name, type);
				continue;
			}

			add[type](device_name, config, control_name, control);
		}
	},
	'wb-mrgbw-d-fw3': 'wb-led',
	'wb-m1w2': {},
	'wb-mai11': {},
}

var hassInitTimeout = 50;

function hassInit(params) {
	if (loading && hassInitTimeout > 0) {
		hassInitTimeout--;
		log('hassInitWaitTimer');
		setTimeout(function() {
			hassInit(params);
		}, 100);
		return;
	}

	log('hassInitMain');

	var ignore = (params['ignore'] !== undefined) ? params['ignore'] : [];

	for(var idx = 0; idx < params['devices'].length; idx++){
		var obj = params['devices'][idx];

		if (obj['name'] == undefined) continue;
		var device_name = obj['name'];

		if (devices[device_name] === undefined) continue;
		var device = devices[device_name];

		if (device['config'] === undefined) continue;
		var config = device['config'];

		if (config['driver'] === undefined) continue;
		var driver = config['driver'];

		if (obj['ignore'] || ignore) {
			var test = ignore.concat((obj['ignore'] !== undefined)?obj['ignore']:[]);
			for(control_name in device['controls']) {
				test.forEach(function (value) {
					if (control_name.toLowerCase().indexOf(value.toLowerCase()) >= 0) {
						device['controls'][control_name]['type'] = undefined;
					}
				});
			}
		}

		if (obj['controls'] !== undefined) {
			obj['controls'].forEach(function (ctrl){
				if (typeof ctrl['name'] === undefined) return;
				var name = ctrl['name'];

				if (typeof device['controls'][name] === undefined) return;

				for(param in ctrl) {
					if (param == 'name' || typeof ctrl[param] === 'function') continue;
					device['controls'][name][param] = ctrl[param];
				}
			})
		}

		if (db[driver] === undefined) {
			log("unknown driver={}", driver);
			continue;
		}

		if (typeof db[driver] == 'function') {
			db[driver](device_name, config, device);
		} else {
			db['default'](device_name, config, device);
		}
	}
}
