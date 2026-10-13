import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_ACTION_PATH, toAppAuthActionLink } from './authActionLink.js';

describe('toAppAuthActionLink', () => {
  it('rewrites the Firebase hosted handler onto the Metabolic app', () => {
    const firebaseLink =
      'https://metabolic-v1.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=TESTCODE123&apiKey=AIzaSyTest&continueUrl=http%3A%2F%2Flocalhost%3A5173%2Flogin&lang=en';

    const appLink = toAppAuthActionLink(firebaseLink, 'http://localhost:5173');
    const parsed = new URL(appLink);

    assert.equal(parsed.origin, 'http://localhost:5173');
    assert.equal(parsed.pathname, AUTH_ACTION_PATH);
    assert.equal(parsed.searchParams.get('mode'), 'verifyEmail');
    assert.equal(parsed.searchParams.get('oobCode'), 'TESTCODE123');
    assert.equal(parsed.searchParams.get('apiKey'), 'AIzaSyTest');
    assert.equal(parsed.searchParams.get('lang'), 'en');
    assert.equal(parsed.searchParams.get('continueUrl'), 'http://localhost:5173/login');
  });

  it('uses production origin when CLIENT_URL is the hosted app', () => {
    const firebaseLink =
      'https://metabolic-v1.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=RESETCODE';
    const appLink = toAppAuthActionLink(firebaseLink, 'https://metabolic-v1.web.app/');
    const parsed = new URL(appLink);
    assert.equal(parsed.origin, 'https://metabolic-v1.web.app');
    assert.equal(parsed.searchParams.get('mode'), 'resetPassword');
    assert.equal(parsed.searchParams.get('continueUrl'), 'https://metabolic-v1.web.app/login');
  });

  it('rejects links that are not Firebase email actions', () => {
    assert.throws(
      () => toAppAuthActionLink('https://metabolic-v1.firebaseapp.com/__/auth/action', 'http://localhost:5173'),
      /missing mode or oobCode/
    );
  });
});
