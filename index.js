'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const Rx = require('rx');
const Kafka = require('no-kafka');

module.exports.createObservable = function (args) {

    return Rx.Observable
        .using(
        () => {
            return new DisposableKafka(args.consumer)
        },
        (d) => {
            return Rx.Observable.create((observer) => {

                function createTopicMessageObject(m) {
                    return {
                        offset: m.offset,
                        value: m.message.value,
                        key: m.message.key
                    }
                }

                const dataHandler = function (messageSet) {
                    messageSet.forEach(function (m) {
                        const sseObject = createTopicMessageObject(m);
                        observer.onNext(sseObject);
                    })
                };

                return d.consumer.init().then(() => {
                    const subscribeOptions = args.offset ? _.merge({ handlerConcurrency: 1 }, { offset: args.offset }) :
                        _.merge({ handlerConcurrency: 1 }, { time: Kafka.LATEST_OFFSET });

                    return d.consumer.subscribe(args.topic, args.partition, subscribeOptions, dataHandler);
                });
            })
        });

    function DisposableKafka(consumer) {
        const d = Rx.Disposable.create(() => {
            consumer.end();
        });
        d.consumer = consumer;
        return d;
    }
};





