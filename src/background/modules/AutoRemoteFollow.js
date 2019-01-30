/**
 * Controller intercepting tab loads and redirecting them to correct modules.
 *
 * @module AutoRenameFollow
 */

import {INTERACTION_TYPE} from "./data/INTERACTION_TYPE.js";

import * as MastodonDetect from "./Detect/Mastodon.js";
import * as GnuSocialDetect from "./Detect/GnuSocial.js";

import * as NetworkTools from "/common/modules/NetworkTools.js";
import * as MastodonRedirect from "./MastodonRedirect.js";

import * as AddonSettings from "/common/modules/AddonSettings/AddonSettings.js";
import * as MastodonHandleCheck from "/common/modules/MastodonHandle/ConfigCheck.js";
import * as MastodonHandleError from "/common/modules/MastodonHandle/ConfigError.js";
import * as Notifications from "/common/modules/Notifications.js";

const FEDIVERSE_TYPE = Object.freeze({
    MASTODON: Symbol("Mastodon"),
    GNU_SOCIAL: Symbol("GNU Social")
});
const FEDIVERSE_MODULE = Object.freeze({
    [FEDIVERSE_TYPE.MASTODON]: MastodonDetect,
    [FEDIVERSE_TYPE.GNU_SOCIAL]: GnuSocialDetect
});

/**
 * Analyses the web request.
 *
 * @function
 * @private
 * @param {Object} requestDetails
 * @returns {Promise}
 */
async function analyzeRequest(requestDetails) {
    // ignore when URL is not changed
    if (!requestDetails.url) {
        return Promise.reject(new Error("URL info not available"));
    }

    const url = new URL(requestDetails.url);

    const [software, interaction] = getInteractionType(url);

    // detect, which network/software it uses
    let detectModule;
    switch (software) {
    case null:
        // ignore unrelated sites, resolves so error handling is not triggered
        return Promise.resolve();
    case FEDIVERSE_TYPE.MASTODON:
        detectModule = MastodonDetect;
        break;
    case FEDIVERSE_TYPE.GNU_SOCIAL:
        detectModule = GnuSocialDetect;
        break;
    default:
        throw new Error(`unknown fediverse type: ${software.toString()}`);
    }

    MastodonRedirect.enableLoadReplace(detectModule.ENABLE_LOAD_REPLACE);

    // and get data and pass to redirect
    switch (interaction) {
    case INTERACTION_TYPE.FOLLOW: {
        const remoteUser = await detectModule.getUsername(url);
        const remoteServer = await detectModule.getServer(url);

        return MastodonRedirect.redirectFollow(remoteUser, remoteServer);
    }
    case INTERACTION_TYPE.TOOT_INTERACT: {
        const tootUrl = await detectModule.getTootUrl(url);

        return MastodonRedirect.redirectToot(tootUrl);
    }
    default:
        throw new Error(`unknown interaction type: ${interaction.toString()}`);
    }
}

/**
 * Listens for Mastodon requests at web request change.
 *
 * @function
 * @private
 * @param {Object} requestDetails
 * @returns {Promise}
 */
function handleWebRequest(requestDetails) {
    return analyzeRequest(requestDetails).catch(async (e) => {
        // open options on click
        const openOptions = () => {
            browser.notifications.onClicked.removeListener(openOptions);
            browser.runtime.openOptionsPage();
        };
        browser.notifications.onClicked.addListener(openOptions);

        // verify that Mastodon handle is correctly saved
        const mastodonHandle = await AddonSettings.get("ownMastodon");
        MastodonHandleCheck.verifyComplete(mastodonHandle).then(() => {
            Notifications.showNotification("couldNotRedirect");
        }).catch((error) => {
            Notifications.showNotification(MastodonHandleError.getMastodonErrorString(error));
        });

        // still throw out for debugging
        throw e;
    });
}

/**
 * Checks what type of interaction the current URL denotes.
 *
 * @function
 * @private
 * @param {URL} url
 * @returns {[FEDIVERSE_TYPE, Symbol]|[null, null]}
 */
function getInteractionType(url) {
    for (const fedType of Object.values(FEDIVERSE_TYPE)) {
        for (const [checkRegEx, interactionType] of FEDIVERSE_MODULE[fedType].CATCH_URLS) {
            if (url.pathname.match(checkRegEx)) {
                return [fedType, interactionType];
            }
        }
    }

    return [null, null];
}

/**
 * Init AutoRemoteFollower module.
 *
 * @function
 * @returns {Promise}
 */
function init() {
    NetworkTools.webRequestListen(["http://*/*", "https://*/*"], "onBeforeRequest", handleWebRequest);
}

init();
