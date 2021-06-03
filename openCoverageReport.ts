import * as open from 'opn';
import { release, platform } from 'os';

let chromeName: string;

const reportLocation = './coverage/index.html';
const platformName = platform();

switch (platformName) {
  case 'darwin':
    chromeName = 'google chrome canary';
    break;
  case 'win32':
    chromeName = 'Chrome';
    break;
  case 'linux':
    if (release().includes('ARCH') || release().includes('MANJARO')) {
      chromeName = 'google-chrome-stable';
    } else {
      chromeName = 'google-chrome';
    }
    break;
  default:
    chromeName = 'google-chrome';
    break;
}

open(reportLocation, { app: chromeName });
