# Changelog

All notable changes to this project are documented in this file.

From `0.1.0` onward this file is maintained automatically by
[Release Please](https://github.com/googleapis/release-please) from
[Conventional Commit](https://www.conventionalcommits.org/) messages — please do not edit
it by hand.

## [0.4.0](https://github.com/bsa717a/metabolic/compare/v0.3.0...v0.4.0) (2026-07-24)


### Features

* **coach:** make the virtual coach the reliable meal-management front end ([4909584](https://github.com/bsa717a/metabolic/commit/4909584a850defcb359c75e3dc2dc5fabcb8ddb6))


### Bug Fixes

* **sms:** route restaurant questions to suggest_meals ([655e0ff](https://github.com/bsa717a/metabolic/commit/655e0ff0b1768df3d4ebcb8bf46d5cf03e84c13c))
* **sms:** route restaurant questions to suggest_meals and drop misleading Got it! ([aca6ff6](https://github.com/bsa717a/metabolic/commit/aca6ff6e75abf796c789f0e11c4c953858b4b2c1))

## [0.3.0](https://github.com/bsa717a/metabolic/compare/v0.2.0...v0.3.0) (2026-07-21)


### Features

* **admin:** add Message Center email builder ([3c576a5](https://github.com/bsa717a/metabolic/commit/3c576a50ac6c33db54e69b059ae3d04cb923276b))
* **admin:** Message Center email builder ([c4d1416](https://github.com/bsa717a/metabolic/commit/c4d1416176edc6d4301c2e6373668f779141f476))


### Bug Fixes

* **deploy:** mount OPENAI_API_KEY and unsubscribe secret on Cloud Run ([94a3e33](https://github.com/bsa717a/metabolic/commit/94a3e33196bf11baf71effbe7381e9a6a92f159d))
* **deploy:** mount OPENAI_API_KEY on Cloud Run ([e05c94d](https://github.com/bsa717a/metabolic/commit/e05c94d0adcccd208a359442f5703ae4922a9393))
* **email:** send SendGrid inline image content_id ([89f5bf3](https://github.com/bsa717a/metabolic/commit/89f5bf361c93d740190dc96e8a8f329fa74de7b8))
* **email:** SendGrid inline image content_id ([504dd52](https://github.com/bsa717a/metabolic/commit/504dd52b0e1a0e539b81950bcda468a9e0e95adc))
* **email:** serve Message Center images from API host ([9ff9594](https://github.com/bsa717a/metabolic/commit/9ff95946393c0af4930e1515ee229d5b8e54f748))
* **email:** serve Message Center images from the API host ([b1f91fe](https://github.com/bsa717a/metabolic/commit/b1f91fe5f46cb3ec052c50c71ff2de14dc446918))
* **shopping-list:** show US buy amounts and merge duplicate foods ([e7d9151](https://github.com/bsa717a/metabolic/commit/e7d9151eb8eade7eb85f29cc2461fe3099ea49fc))
* **shopping-list:** US buy amounts and food dedupe ([86ab407](https://github.com/bsa717a/metabolic/commit/86ab407b58fad4c36e98aa1625e42d9fdf74e3a2))

## [0.2.0](https://github.com/bsa717a/metabolic/compare/v0.1.0...v0.2.0) (2026-07-18)


### Features

* add public support page ([19ce1c3](https://github.com/bsa717a/metabolic/commit/19ce1c31f605965e59335816c0d63767c81d7958))
* add public support page ([ee41dab](https://github.com/bsa717a/metabolic/commit/ee41daba82814d7df5693753d7c6dde7715ba44a))
* Beta Plus signup provisioning and owner SMS alerts ([919c7c4](https://github.com/bsa717a/metabolic/commit/919c7c4e1f24bfc42a8a1e4e857bae59775e93e5))
* **coach:** meal edit mode with rebalance prompts ([271a213](https://github.com/bsa717a/metabolic/commit/271a2138ec68417d9df5d496043faadf1ff39747))
* **coach:** meal edit mode with rebalance prompts ([17427e3](https://github.com/bsa717a/metabolic/commit/17427e3cfd967ea2ebc4e6f3b12bd06df01204db))
* **dashboard:** streamline tiles and add mini blueprint + macro donuts ([b1c0894](https://github.com/bsa717a/metabolic/commit/b1c0894eb12d81f13fd88f90427d2f4771c691b6))
* make SMS coach answer any data question and enable agent mode ([64c89d0](https://github.com/bsa717a/metabolic/commit/64c89d05fbce5b87e723576981a929d98b3da37f))
* **nutrition:** mobile layout with actions menu and bottom home nav ([44c2103](https://github.com/bsa717a/metabolic/commit/44c2103bfe5e7fb83f725bbaee8f8c3168e5c3ad))
* **onboarding:** coach-led chat setup with allergies and meal-card fixes ([3907349](https://github.com/bsa717a/metabolic/commit/390734918112a062f51d4da9b1a128cef4e09e12))
* **onboarding:** coach-led chat setup with allergies and meal-card fixes ([3a83240](https://github.com/bsa717a/metabolic/commit/3a8324087b7d6c20717da1b43942c70f2bd11ef7))
* **onboarding:** streamline setup flow and improve coach chat mobile UX ([70f0b6a](https://github.com/bsa717a/metabolic/commit/70f0b6a65c10bfecd7d0be7ae423a28641c31766))
* **onboarding:** streamline setup flow and improve coach chat mobile UX ([6ffb5c8](https://github.com/bsa717a/metabolic/commit/6ffb5c83848a40e6b7a0c77dab12e8fbfc549777))
* provision new accounts at the Plus tier during Beta ([e4429a6](https://github.com/bsa717a/metabolic/commit/e4429a670454978b5f7c0831d4059e5e38196ff3))
* SMS the owner when a new account signs up ([d47aced](https://github.com/bsa717a/metabolic/commit/d47aced4509c3d6bfefd257aa02896fa6cffd5b2))


### Bug Fixes

* address Bugbot findings in SMS coach routing ([fdb27d4](https://github.com/bsa717a/metabolic/commit/fdb27d44c3d98f3e8047b38163236bd5966d3dd3))
* address Bugbot findings in SMS explicit macro logging ([eaf41e8](https://github.com/bsa717a/metabolic/commit/eaf41e82f74db3700f3d7e186d40c68cec4dcbd8))
* **build:** exclude test files from server production compile ([4601988](https://github.com/bsa717a/metabolic/commit/46019882556183f559dbbd55155921a482128618))
* **build:** exclude test files from server production compile ([77dce28](https://github.com/bsa717a/metabolic/commit/77dce28beb55be695dbec7c4900949a1df19adc2))
* do not block signup on Twilio signup alert SMS ([bf9ca25](https://github.com/bsa717a/metabolic/commit/bf9ca25b539711ef3abd94328bd64b1f65783fd3))
* exercise mark-done 500 from transaction self-deadlock ([f41938e](https://github.com/bsa717a/metabolic/commit/f41938ed6aed138a396ffc66c63de633221a6c99))
* exercise mark-done 500 from transaction self-deadlock ([887779c](https://github.com/bsa717a/metabolic/commit/887779c3ba0968aacf83ad8826be87fd13239b43))
* honor user-supplied macros when logging SMS food ([81c5beb](https://github.com/bsa717a/metabolic/commit/81c5beb452afb425c343ab74d6b0de8f55f522ca))
* honor user-supplied macros when logging/correcting SMS food ([e746716](https://github.com/bsa717a/metabolic/commit/e7467161382cf3dfb5e98cf4dabc3760c43cdd56))
* **nutrition:** resolve targets as single source of truth for plan display and meal scaling ([0faae41](https://github.com/bsa717a/metabolic/commit/0faae417438cd473538802f4dc24c9e1dd9e00f9))
* **nutrition:** resolved targets as source of truth + macro overrides ([555f19c](https://github.com/bsa717a/metabolic/commit/555f19ca361b466d41c0fcc8e9827075ede2f532))
* SMS coach answers data questions and enables agent mode ([26eb3b7](https://github.com/bsa717a/metabolic/commit/26eb3b7d123bf754b5c37ad3b40a53db5a153225))

## 0.1.0 (2026-07-11)

Baseline release establishing automated semantic versioning for the repository. No prior
release history is reconstructed here; all future entries are generated automatically from
Conventional Commit messages merged into the default branch.
