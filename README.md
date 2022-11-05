Данный скрипт устарел, новый скрипт https://github.com/4mr/wb-engine

# Wirenboard Mqtt Home Assistant

Интеграция устройств Wirenboard в Home Assistant

### Установка

Скопируйте файл hass.js в папку /etc/wb-rules-modules/
```
curl https://github.com/4mr/wb-mqtt-homeassistant/raw/master/hass.js -o /etc/wb-rules-modules/hass.js
```

В веб интерфейсе Wirenboard создайте правило:
```
var config = {
  topic: 'homeassistant',
  ignore: ['Serial'],
  devices: [
    {name: 'wb-mr6cu_68'},
    {name: 'wb-mr6c_201',
      controls: [
        {name: 'K1', type: 'light'},
        {name: 'K2', type: 'light'},
        {name: 'K3', type: 'light'},
      ]
    },
    {name: 'wb-mrgbw-d-fw3_19'},
    {name: 'wb-mdm3_181'},
    {name: 'wb-msw-v3_16',
      ignore: ['ROM', 'RAM'],
      controls: [
        {name: 'Max Motion', type: 'motion', motion_level: 100},
        {name: 'Current Motion', type: 'motion', motion_level: 50}
      ]
    },
]
};

var hass = require("hass");
hass.init(config);
```

Перезапустите wb-rules
```
systemctl restart wb-rules
```

В Home Assistant добавьте MQTT интеграцию 
* Настройки - Устройства и службы - Добавить интеграцию
* Укажите адрес MQTT брокера Wirenboard

После этого устройства должны добавиться автоматически.

