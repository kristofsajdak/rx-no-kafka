'use strict';

const _ = require('lodash');
const Rx = require('rx');
const uuid = require('node-uuid');
const chai = require('chai');
const expect = chai.expect;
const rxNoKafka = require('../');
const Kafka = require('no-kafka');
const url = require('url');

describe('Given a Kafka topic \'all\' with partition 0', function () {

    beforeEach(function () {
        const kafkaHostUrl = process.env.DOCKER_HOST;
        const kafkaHostName = kafkaHostUrl ? url.parse(kafkaHostUrl).hostname : '127.0.0.1';
        this.options = { connectionString: `${kafkaHostName}:9092` };
        this.noKafkaProducer = new Kafka.Producer(this.options);
        return this.noKafkaProducer.init()
    });


    afterEach(function () {
        this.noKafkaProducer.end();
    });

    function insert(producer, topic, partition, event, id, title) {
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
    }

    it(`When a rx-no-kafka observable is created from that topic 
    And a new message is added to the topic / partition
    Then the observable should receive that message`, function (done) {
        const id = uuid.v4()
        const noKafkaObservable = rxNoKafka.createObservable({
            consumer: new Kafka.SimpleConsumer(this.options), topic: 'all', partition: 0
        });
        const subscription = noKafkaObservable
            .subscribe((e) => {
                assertEventState(e, 'books.insert', id, 'test title1');
                subscription.dispose();
                done()
            });
        insert(this.noKafkaProducer, 'all', 0, 'books.insert', id, 'test title1')
    });

    describe('And that topic contains a message', function () {

        const id1 = uuid.v4();
        const id2 = uuid.v4();

        beforeEach(function () {
            return insert(this.noKafkaProducer, 'all', 0, 'books.insert', id1, 'test title1');
        });

        it(`When a rx-no-kafka observable is created from that topic without an offset 
        And a new message is added to the topic / partition
        Then the observable should only receive the last message`, function (done) {
            const noKafkaObservable = rxNoKafka.createObservable({
                consumer: new Kafka.SimpleConsumer(this.options), topic: 'all', partition: 0
            });
            const subscription = noKafkaObservable
                .subscribe((e) => {
                    assertEventState(e, 'books.insert', id2, 'test title2');
                    subscription.dispose();
                    done();
                });
            insert(this.noKafkaProducer, 'all', 0, 'books.insert', id2, 'test title2');
        })
    });

    describe('And that topic contains 3 messages', function () {

        const id1 = uuid.v4();
        const id2 = uuid.v4();
        const id3 = uuid.v4();

        beforeEach(function () {
            return insert(this.noKafkaProducer, 'all', 0, 'books.insert', id1, 'test title1')
                .then(() => insert(this.noKafkaProducer, 'all', 0, 'books.insert', id2, 'test title2'))
                .then((result) => this.offset = result[0].offset)
                .then(() => insert(this.noKafkaProducer, 'all', 0, 'books.insert', id3, 'test title3'))
        });

        it(`When a rx-no-kafka observable is created from that topic with the offset of the second message
        Then the observable should only receive the second and third message`, function (done) {
            const noKafkaObservable = rxNoKafka.createObservable({
                consumer: new Kafka.SimpleConsumer(this.options), topic: 'all', partition: 0, offset: this.offset
            });
            const subscription = noKafkaObservable
                .bufferWithCount(2)
                .subscribe((events) => {
                    assertEventState(events[0], 'books.insert', id2, 'test title2');
                    assertEventState(events[1], 'books.insert', id3, 'test title3');
                    subscription.dispose();
                    done();
                });
        })
    })

    describe('And that topic contains 3 messages', function () {

        const id1 = uuid.v4();
        const id2 = uuid.v4();
        const id3 = uuid.v4();

        beforeEach(function () {
            return insert(this.noKafkaProducer, 'all', 0, 'books.insert', id1, 'test title1')
                .then((result) => this.offset1 = result[0].offset)
                .then(() => insert(this.noKafkaProducer, 'all', 0, 'books.insert', id2, 'test title2'))
                .then((result) => this.offset2 = result[0].offset)
                .then(() => insert(this.noKafkaProducer, 'all', 0, 'books.insert', id3, 'test title3'))
                .then((result) => this.offset3 = result[0].offset)
        });

        it(`When 2 rx-no-kafka observables are created and both specify different offsets
        Then the observables should receive messages according to the offset`, function (done) {

            const join = new Rx.Subject();

            const noKafkaObservable1 = rxNoKafka.createObservable({
                consumer: new Kafka.SimpleConsumer(this.options), topic: 'all', partition: 0, offset: this.offset2
            });
            noKafkaObservable1
                .bufferWithCount(2)
                .do((events) => {
                    assertEventState(events[0], 'books.insert', id2, 'test title2');
                    assertEventState(events[1], 'books.insert', id3, 'test title3');
                })
                .subscribe(join);

            const noKafkaObservable2 = rxNoKafka.createObservable({
                consumer: new Kafka.SimpleConsumer(this.options), topic: 'all', partition: 0, offset: this.offset3
            });
            noKafkaObservable2
                .do((event) => {
                    assertEventState(event, 'books.insert', id3, 'test title3');
                })
                .subscribe(join);

            join.bufferWithCount(2).subscribe(() => {
                join.dispose();
                done()
            })

        })

    })

})

function assertEventState(e, type, id, title) {
    const parsedKey = e.key.toString();
    const parsedValue = JSON.parse(e.value.toString());
    expect(parsedKey).to.equal(type);
    expect(parsedValue.id).to.equal(id);
    expect(parsedValue.attributes).to.deep.equal({
        title: title
    })
}


