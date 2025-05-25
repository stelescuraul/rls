import 'reflect-metadata';

import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';

chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);

chai.config.truncateThreshold = 0;
