import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'walk-e2e-'));
export default defineConfig({testDir:'tests/e2e',timeout:90000,expect:{timeout:10000},workers:1,retries:0,reporter:[['list'],['html',{open:'never'}]],use:{baseURL:'http://127.0.0.1:4173',headless:true,viewport:{width:1512,height:982},launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},trace:'retain-on-failure',screenshot:'only-on-failure'},webServer:{command:'npm run build && npm start',url:'http://127.0.0.1:4173/api/health',timeout:120000,reuseExistingServer:false,env:{...(process.env.WALK_TURN_URL?{WALK_TURN_URL:process.env.WALK_TURN_URL,WALK_TURN_USERNAME:process.env.WALK_TURN_USERNAME||'',WALK_TURN_CREDENTIAL:process.env.WALK_TURN_CREDENTIAL||''}:{}),PORT:'4173',DATABASE_PATH:join(directory,'test.sqlite'),ADMIN_KEY:'e2e-only-admin-key-12345678901234567890',APP_ORIGIN:'http://127.0.0.1:4173',COOKIE_SECURE:'false',WALK_STUN_URL:'off'}}});
