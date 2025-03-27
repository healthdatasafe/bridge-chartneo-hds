const { getConfig, getLogger } = require('boiler');
const { bridgeConnection, streamIdForUserId, USERS_STREAM_ID } = require('../lib/bridgeAccount');
const pryvService = require('../lib/pryvService');
const { internalError } = require('../errors');

const logger = getLogger('onboard');

module.exports = {
  init,
  onboardProcess,
  authStatusesGet,
  authStatusesClean
};

/**
 * Will be set by init with values from the config and service
 */
const settings = {
  requestingAppId: null,
  requestedPermissions: null,
  apiAccessUrl: null,
  returnURL: null,
  consentMessage: null
};
// from Pryv service
async function init () {
  const config = await getConfig();
  settings.requestingAppId = config.get('pryv:appId');
  settings.requestedPermissions = config.get('pryv:permissions');
  settings.consentMessage = config.get('pryv:consentMessage');
  validatePermissions(settings.requestedPermissions);
  settings.returnURL = config.get('baseURL') + '/user/onboard/finalize/';

  settings.apiAccessUrl = (await pryvService.service().info()).access;
}

/**
 * Create an onboarding URL for this patient
 * @param {string} partnerUserId
 * @returns {string} URL to onboard the patient
 */
async function onboardProcess (partnerUserId) {
  // check if user is active

  // -- todo

  // create Auth Request
  const authRequestBody = {
    requestingAppId: settings.requestingAppId,
    requestedPermissions: settings.requestedPermissions,
    returnURL: settings.returnURL + partnerUserId, // add partneruserid to return URL
    clientData:
      {
        'app-web-auth:description':
            {
              type: 'note/txt',
              content: settings.consentMessage
            }
      }
  };
  const response = await fetch(settings.apiAccessUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(authRequestBody)
  });
  const responseBody = await response.json();

  // -- store request intent
  await authStatusStore(partnerUserId, responseBody);

  const result = {
    type: 'authRequest',
    content: responseBody
  };

  return result;
}

// ------ onboard steps

/**
 * Set the
 */

/**
 * Get pending auth status (my be sevrals)
 * @param {string} partnerUserId
 * @returns {Array} of status
 */
async function authStatusesGet (partnerUserId) {
  const userStreamId = streamIdForUserId(partnerUserId);
  const apiCalls = [{
    method: 'events.get',
    params: { streams: [userStreamId], types: ['temp-status/bridge-auth-request'] }
  }];
  const response = (await bridgeConnection().api(apiCalls))[0];
  // -- todo check response
  return response.events || [];
}

async function authStatusStore (partnerUserId, responseBody) {
  const userStreamId = streamIdForUserId(partnerUserId);
  const apiCalls = [{
    method: 'streams.create',
    params: { id: userStreamId, parentId: USERS_STREAM_ID, name: partnerUserId }
  }, {
    method: 'events.create',
    params: {
      type: 'temp-status/bridge-auth-request',
      streamIds: [userStreamId],
      content: responseBody
    }
  }];
  await bridgeConnection().api(apiCalls);
  // -- todo check response
}

/**
 * Array of pending authStatus to remove
 * @param {Array<Events>} authStatusEvents
 */
async function authStatusesClean (authStatusEvents) {
  if (!authStatusEvents || authStatusEvents.length < 1) return;
  const apiCalls = [];
  for (const e of authStatusEvents) {
    const deleteCall = { method: 'events.delete', params: { id: e.id } };
    apiCalls.push(deleteCall, deleteCall); // twice for a real delete
  }
  const res = await bridgeConnection().api(apiCalls);
  for (const r of res) {
    if (r.error) logger.error('Failed deleting status event', r);
    if (r.eventDeletion) logger.info(`Deleted status event id: ${r.eventDeletion.id}`);
  }
}

// ------- helpers

/**
 * Validate if settings for requested permissions is valid
 */
function validatePermissions (permissions) {
  if (!Array.isArray(permissions)) internalError('Permissions setting should be an array: ' + JSON.stringify(permissions, null, 2));
  if (permissions.length === 0) internalError('Permissions setting should have one element ' + JSON.stringify(permissions, null, 2));
  for (const p of permissions) {
    for (const k of ['streamId', 'level', 'defaultName']) {
      if (!p[k] || typeof p[k] !== 'string') internalError('Permissions setting is not valid ' + JSON.stringify(p, null, 2));
    }
  }
}
