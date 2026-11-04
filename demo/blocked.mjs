import {createGate,sha256} from '../src/gate.mjs';
const gate=createGate();
const SHA='1'.repeat(40);
let d=gate.begin(SHA,'DEMO-001');
console.log('Initial:', d.status, ' / ',d.requirements.map(x=>x.id+':'+x.state).join(', '));
d=gate.discover(d.id,{requirementId:'engineering',room:'release-room',eventId:'DEMO-ENGINEERING-EVENT',documentDigest:sha256('seeded engineering tests'),collector:'offline-fixture'});
d=gate.recordInternalVerification(d.id,{requirementId:'engineering',sha:SHA,command:'baseline-tests',exitCode:0,outputDigest:sha256('fake fixture baseline result'),runnerId:'offline-fixture'});
console.log('Engineering only:',d.status, ' / ',d.requirements.map(x=>x.id+':'+x.state).join(', '));
d=gate.discover(d.id,{requirementId:'support',room:'support-room',eventId:'DEMO-SUPPORT-EVENT',documentDigest:sha256('successive refunds must not exceed captured amount'),collector:'offline-fixture'});
d=gate.recordInternalVerification(d.id,{requirementId:'support',sha:SHA,command:'refund-regression',exitCode:1,outputDigest:sha256('fake fixture refund test failed'),runnerId:'offline-fixture'});
console.log('Missing fact recovered:',d.status, ' / ',d.requirements.map(x=>x.id+':'+x.state).join(', '));
try {gate.requestExecution(d.id);} catch(err) {console.log('Release action:',err.code,'-',err.message);}
console.log('WARNING: This is an OFFLINE POLICY FIXTURE, not live Switch traffic, not a real Git SHA or a real verification run.');
