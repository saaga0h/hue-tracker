const discovery = require('hue-bridge-discovery')
    , config = require('config')
    , _ = require('lodash')
    , axios = require('axios')
    , Client = require('mongodb').MongoClient
    , browser = new discovery();

const SENSORS = ['Daylight', 'ZLLTemperature', 'ZLLLightLevel'];

const processSensors = async (address) => {
  let result;

  try {
    result = await axios.get(`http://${address}/api/${config.get('hue.username')}/sensors`);
  } catch (err) {
    console.error(err);
  }

  return _(result.data).filter((sensor, key) => SENSORS.indexOf(sensor.type) > -1)
                       .map((sensor, key) => ({ id: key, name: sensor.name, type: sensor.type, ...sensor.state }))
                       .value();
};

const processLights = async (address) => {
  let result;

  try {
    result = await axios.get(`http://${address}/api/${config.get('hue.username')}/lights`);
  } catch (err) {
    console.error(err);
  }

  return _.map(result.data, (light, key) => ({ id: key, name: light.name, ...light.state }));
};

browser.on(discovery.EVENT_HUE_DISCOVERED, async (device) => {
  const lights = await processLights(device.address);
  const sensors = await processSensors(device.address);

  const temperature = _.find(sensors, { type: 'ZLLTemperature' }).temperature;
  const ambient =  _.find(sensors, { type: 'ZLLLightLevel' });

  const data = {
    timestamp: new Date().getTime(),
    lights: lights.map(light => ({
      id: light.id,
      on: light.on,
      bri: light.bri,
      ct: light.ct,
      sat: light.sat || undefined,
      hue: light.hue || undefined
    })),
    sensors: {
      temperature: temperature / 100 + 1.7,
      ambient: {
        lightlevel: ambient.lightlevel,
        dark: ambient.dark,
        daylight: ambient.daylight
      }
    }
  }

  const uri = `mongodb+srv://${config.get('db.username')}:${encodeURIComponent(config.get('db.password'))}@${config.get('db.host')}/${config.get('db.name')}?retryWrites=true`;

  const client = await new Client(uri, { useNewUrlParser: true })

  client.connect((err) => {
    const collection = client.db(config.get('db.name')).collection(config.get('db.collection'));

    collection.insertOne(data);

    client.close();
  });
});

browser.start();
