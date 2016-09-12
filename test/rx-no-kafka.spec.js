'use strict'

const _ = require('lodash')
const Rx = require('rx')
const uuid = require('node-uuid')
const chai = require('chai')
const expect = chai.expect
const rxNoKafka = require('../')
const Kafka = require('no-kafka')
const url = require('url')

describe('Given a rx-no-kafka observable created from topic \'all\' with partition 0', function () {

    beforeEach(function () {
        const kafkaHostUrl = process.env.DOCKER_HOST;
        const kafkaHostName = kafkaHostUrl ? url.parse(kafkaHostUrl).hostname : '127.0.0.1';
        const options = { connectionString: `${kafkaHostName}:9092` };
        this.noKafkaObservable = rxNoKafka.createObservable({
            consumer: new Kafka.SimpleConsumer(options), topic: 'all', partition: 0
        });
        this.noKafkaProducer = new Kafka.Producer(options);
    })


    afterEach(function () {
        this.noKafkaProducer.end();
    })

    function insert(producer, topic, partition, event, id, title) {
        return producer.init().then(() => {
            return producer.send({
                topic: topic,
                partition: partition,
                message: {
                    key: event,
                    value: JSON.stringify({
                        id,
                        type: 'books',
                        attributes: {
                            title
                        }
                    })
                }
            });
        });
    }

    describe('', function () {
        it('When a new message is added to the topic / partition Then the observable should receive that message', function (done) {
            const id = uuid.v4()
            const subscription = this.noKafkaObservable
                .subscribe((e) => {
                    assertEventState(e, 'books.insert', id, 'test title1');
                    subscription.dispose()
                    done()
                })
            insert(this.noKafkaProducer, 'all', 0, 'books.insert', id, 'test title1')
        })
    })
})



function assertEventState(e, type, id, title) {
    const parsedKey = new Buffer(e.key).toString();
    const parsedValue = JSON.parse(new Buffer(e.value).toString());
    expect(parsedKey).to.equal(type)
    expect(parsedValue.id).to.equal(id)
    expect(parsedValue.attributes).to.deep.equal({
        title: title
    })
}


