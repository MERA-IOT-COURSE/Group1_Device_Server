const mqtt = require('mqtt')
const version = "1.0"

function buildActionsData(actions) {
    var actionsData = []

    actions.forEach(action => {
        actionsData.push({
            "id": action.getId(),
            "name": action.getName()
        })
    })

    return actionsData
}

function buildSensorsData(sensors) {
    var sensorsData = []

    sensors.forEach(sensor => {
        sensorsData.push({
            "id": sensor.getId(),
            "type": sensor.getType(),
            "actions": buildActionsData(sensor.getActions())
        })
    })

    return sensorsData
}

function buildInitData(device) {
    return {
        "version": version,
        "hw_id": device.getHardwareId(),
        "sensors": buildSensorsData(device.getSensors()),
        "actions": buildActionsData(device.getActions()),
        "name": device.getName()
    }
}

function buildMessage(messageId, data) {
    return {
        "mid": messageId,
        "data": data
    }
}

class ConnectionHandler {
    constructor(ip, port, device, backendId) {
        this.client = mqtt.connect(`mqtt://${ip}:${port}`)
        this.device = device
        this.backendId = backendId
        this.registerTimeoutMs = 60 * 1000
        
        // Register the device: send registration immediately and then by timeout 
        this.client.on('connect', () => {
            console.log("Connected to broker", this.registerTimeoutMs)
            
            this.sendRegistration()
            this.registrationTimer = setInterval(() => { this.sendRegistration() }, this.registerTimeoutMs)
        })

        this.client.on('message', (topic, message) => {
            this.onMessage(topic, message)
        })

        // Register sensors listeners
        device.getSensors().forEach(sensor => {
            sensor.on('data', (sensor, value, ts) => {
                this.sendSensorData(sensor, value, ts)
            })
        })
    }

    sendRegistration() {
        var message = buildMessage(
            "REGISTER",
            buildInitData(this.device)
        )

        this.sendMessage(`init_${this.backendId}`, message)
    }

    sendSensorData(sensor, value, ts) {
        var sensorData = {
            "sensor_id": sensor.getId(),
            "value": value,
            "ts": ts
        }

        var message = buildMessage(
            "SENSOR_DATA",
            sensorData
        )
        
        this.sendMessage(`be_${this.device.getHardwareId()}`, message)
    }

    sendMessage(topic, data) {
        var message = JSON.stringify(data)
        this.client.publish(topic, message)
        console.log(`Sending message:  [${topic}] ${message}`)
    }

    onMessage(topic, message) {
        console.log(`Incoming message: [${topic}] ${message.toString()}`)

        if (topic != `dev_${this.device.getHardwareId()}`)
            return

        // Must be:
        // {
        //     "mid": <message id>,
        //     "data": <payload specific for mid>
        // }
        parsedMessage = JSON.parse(message)
        switch (parsedMessage.mid) {
            case 'REGISTER_RESP':
                onRegistrationResponse(parsedMessage.data)
                break
            case 'REQ_DEVICE_ACTION':
                onDeviceAction(parsedMessage.data)
                break
            case 'REQ_SENSOR_ACTION':
                onSensorAction(parsedMessage.data)
                break
        }
    }

    onRegistrationResponse(data) {
        if (data.status != 'OK') {
            console.log(`Registration failure! Reason: ${data.status}`)
            return
        }

        if ('registration_delay' in data) {
            this.registerTimeoutMs = data['registration_delay'] * 1000 // convert to ms
            clearInterval(this.registrationTimer)
            this.registrationTimer = setInterval(() => { this.sendRegistration() }, this.registerTimeoutMs)
        }
    }

    onDeviceAction(data) {
        actions = this.device.getActions()
        action = actions.find((action) => { return action.getId() == data['id'] })

        if (action) {
            action.run()
            // TODO: send response 
        }
    }

    onSensorAction(data) { 
        sensors = this.device.getSensors()
        sensor = sensors.find((sensor) => { return sensor.getId() == data['sensor_id'] })

        if (!sensor)
            return
            
        actions = sensor.getActions()
        action = actions.find((action) => { return action.getId() == data['id'] })

        if (action) {
            action.run()
            // TODO: send response 
        }
    }
}

module.exports.ConnectionHandler = ConnectionHandler