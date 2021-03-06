
let self = {
  itch_repo: 'https://github.com/itchio/itch',
  itchio: 'https://itch.io',
  itch_translation_platform: 'https://weblate.itch.ovh/projects/itch',
  github_api: 'https://api.github.com',
  ibrew_repo: 'https://dl.itch.ovh',
  remote_locale_path: 'http://locales.itch.ovh/itch'
}

let itchio_api = process.env.WHEN_IN_ROME ? 'http://localhost.com:8080' : self.itchio

Object.assign(self, {
  itchio_api,
  terms_of_service: `${self.itchio}/docs/legal/terms`,
  account_register: `${self.itchio}/register`,
  account_forgot_password: `${self.itchio}/user/forgot-password`,
  developers_learn_more: `${self.itchio}/developers`,
  my_collections: `${self.itchio}/my-collections`,
  rar_policy: `${self.itchio}/t/11918/rar-support-is-not-happening-repack-your-games`,
  deb_policy: `${self.itchio}/t/13882/deb-and-rpm-arent-supported-by-itch-please-ship-portable-linux-builds`,
  rpm_policy: `${self.itchio}/t/13882/deb-and-rpm-arent-supported-by-itch-please-ship-portable-linux-builds`
})

module.exports = self
