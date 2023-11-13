const {DynamoDB} = require('@aws-sdk/client-dynamodb')
const { expect } = require('chai');
const { describe, it } = require('mocha');
const RateLimiterDynamo = require('../lib/RateLimiterDynamo');
const sinon = require('sinon');

/*
    In order to perform this tests, you need to run a local instance of dynamodb:
    docker run -p 8000:8000 amazon/dynamodb-local
*/
describe('RateLimiterDynamo with fixed window', function RateLimiterDynamoTest() {
    this.timeout(5000);

    const dynamoClient = new DynamoDB({endpoint: 'http://localhost:8000'});
    
    it('DynamoDb client connection', (done) => {
        expect(dynamoClient).to.not.equal(null);
        dynamoClient.listTables()
        .then((data) => {
            done();
        })
        .catch((err) => {
            done(err);
        });
    });

    it('get item from DynamoDB', (done) => {
        
        const testKey = 'test';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.get(testKey)
                .then((response) => {
                    expect(response).to.not.equal(null);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
            })
            .catch((err) => {
                done(err);
            })
        }
        );
    });

    it('get NOT existing item from DynamoDB', (done) => {
        
        const testKey = 'not_existing';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.get(testKey)
            .then((response) => {
                expect(response).to.equal(null);
                done();
            })
            .catch((err) => {
                done(err);
            });
        }
        );
    });

    it('delete item from DynamoDB', (done) => {
        
        const testKey = 'delete_test';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.delete(testKey)
                .then((response) => {
                    expect(response).to.equal(true);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
            })
            .catch((err) => {
                done(err);
            })
        }
        );
    });

    it('delete NOT existing item from DynamoDB', (done) => {
        
        const testKey = 'delete_test_2';
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient
        },
        () => {
            rateLimiter.set(testKey, 999, 10000)
            .then((data) => {
                rateLimiter.delete(testKey)
                .then((response) => {
                    expect(response).to.equal(true);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
            })
            .catch((err) => {
                done(err);
            })
        }
        );
    });
    
    it('consume 1 point', (done) => {
        const testKey = 'consume1';

        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 2,
            duration: 10
        },
        () => {
            rateLimiter.consume(testKey)
                .then((result) => {
                    expect(result.consumedPoints).to.equal(1);
                    rateLimiter.delete(testKey);
                    done();
                })
                .catch((err) => {
                    done(err);
                });

        });
        
    });

    it('rejected when consume more than maximum points', (done) => {
        const testKey = 'consumerej';
    
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 1,
            duration: 5
        },
        () => {
            rateLimiter.consume(testKey, 2)
                .then((result) => {
                    expect(result.consumedPoints).to.equal(2);
                    done(Error('must not resolve'));
                })
                .catch((err) => {
                    expect(err.consumedPoints).to.equal(2);
                    done();
                });

        });
    });

    it('blocks key for block duration when consumed more than points', (done) => {
        const testKey = 'block';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 1,
            duration: 1,
            blockDuration: 2
        },
        () => {
            rateLimiter.consume(testKey, 2)
                .then((result) => {
                    expect(result.consumedPoints).to.equal(2);
                    done(Error('must not resolve'));
                })
                .catch((err) => {
                    expect(err.msBeforeNext > 1000).to.equal(true);
                    done();
                });

        });
        
    });

    it('return correct data with _getRateLimiterRes', () => {
        const testKey = 'test';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            const res = rateLimiter._getRateLimiterRes(
                'test',
                1,
                { key: 'test', points: 3, expire: Date.now() + 1000}
                );

            expect(res.msBeforeNext <= 1000 && 
                        res.consumedPoints === 3 && 
                        res.isFirstInDuration === false && 
                        res.remainingPoints === 2
                    ).to.equal(true);

        });
    });

    it('get points', (done) => {
        const testKey = 'get';
    
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            rateLimiter.set(testKey, 999, 10000)
                .then((data) => {
                    rateLimiter.get(testKey)
                        .then((response) => {
                            expect(response.consumedPoints).to.equal(999);
                            rateLimiter.delete(testKey);
                            done();
                        })
                        .catch((err) => {
                            done(err);
                        });
                })
                .catch((err) => {
                    done(err);
                });

        });

    });

    it('get points return NULL if key is not set', (done) => {
        const testKey = 'getnull';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            rateLimiter.get(testKey)
                .then((response) => {
                    expect(response).to.equal(null);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
        
    });

    it('delete returns false, if there is no key', (done) => {
        const testKey = 'getnull3';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
            
            rateLimiter.delete(testKey)
                .then((response) => {
                    expect(response).to.equal(false);
                    done();
                })
                .catch((err) => {
                    done(err);
                });
        });
        
    });

    it('delete rejects on error', (done) => {
        const testKey = 'deleteerr';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 5,
        },
        () => {
           
            sinon.stub(dynamoClient, 'deleteItem').callsFake(() => {
                throw new Error('stub error');
            });

            rateLimiter.delete(testKey)
            .catch(() => {
                done();
            });

            dynamoClient.deleteItem.restore();
        });
        
    });
    

    it('does not expire key if duration set to 0', (done) => {
        const testKey = 'neverexpire';
        
        const rateLimiter = new RateLimiterDynamo({
            storeClient: dynamoClient,
            points: 2,
            duration: 0
        },
        () => {
            
            rateLimiter.set(testKey, 2, 0)
            .then(() => {
                rateLimiter.consume(testKey, 1)
                    .then(() => {
                        rateLimiter.get(testKey)
                            .then((res) => {
                                expect(res.consumedPoints).to.equal(1);
                                expect(res.msBeforeNext).to.equal(-1);
                                done();
                            })
                            .catch((err) => {
                                done(err);
                            })
                    })
                    .catch((err) => {
                        done(err);
                    })
            })
            .catch((err) => {
                done(err);
            });
            
        });
        
    });
    
});
