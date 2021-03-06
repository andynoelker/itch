
let r = require('r-dom')
import {get, getIn} from 'mori-ext'
let PropTypes = require('react').PropTypes
let ShallowComponent = require('./shallow-component')

let AppStore = require('../stores/app-store')
let AppActions = require('../actions/app-actions')
let urls = require('../constants/urls')

let InputRow = require('./input-row')
let ErrorList = require('./error-list')
let Icon = require('./icon')

class LoginForm extends ShallowComponent {
  constructor () {
    super()
    this.handle_submit = this.handle_submit.bind(this)
    this.handle_login_failure = this.handle_login_failure.bind(this)
  }

  componentDidMount () {
    super.componentDidMount()
    AppStore.on('login_failure', this.handle_login_failure)
  }

  componentWillUnmount () {
    super.componentWillUnmount()
    AppStore.removeListener('login_failure', this.handle_login_failure)
  }

  render () {
    let t = this.t
    let state = this.props.state
    let page = state::get('page')

    let loading, errors, message, icon

    if (page === 'login') {
      loading = state::getIn(['login', 'loading'])
      errors = state::getIn(['login', 'errors'])
      message = t('login.status.login')
      icon = 'heart-filled'
    } else if (page === 'setup') {
      let setup_msg = state::getIn(['login', 'setup', 'message'])
      let setup_var = state::getIn(['login', 'setup', 'variables'])
      loading = true
      errors = []
      message = t(setup_msg, setup_var)
      icon = state::getIn(['login', 'setup', 'icon'])
    } else {
      throw new Error(`Unknown page for login form: ${page}`)
    }

    let primary_action = loading ? this.spinner(icon, message) : this.button()

    return (
      r.form({classSet: {form: true, has_error: (icon === 'error')}, onSubmit: this.handle_submit}, [
        r(ErrorList, {errors, before: r(Icon, {icon: 'neutral'}), i18n_namespace: 'api.login'}),

        r(InputRow, {placeholder: t('login.field.username'), name: 'username', type: 'text', ref: 'username', autofocus: true, disabled: loading}),
        r(InputRow, {placeholder: t('login.field.password'), name: 'password', type: 'password', ref: 'password', disabled: loading}),

        r.div({className: 'buttons'}, [
          primary_action,
          this.secondary_actions()
        ])
      ])
    )
  }

  button () {
    let t = this.t
    return r.button({className: 'button'}, t('login.action.login'))
  }

  spinner (icon, message) {
    return r.span({className: 'login_status'}, [
      r.span({className: `icon icon-${icon} small_throbber_loader`}),
      message
    ])
  }

  secondary_actions () {
    let t = this.t

    return r.div({className: 'login_links'}, [
      r.a({
        href: urls.account_register
      }, t('login.action.register')),

      r.span(' · '),

      r.a({
        href: urls.account_forgot_password
      }, t('login.action.reset_password'))
    ])
  }

  handle_submit (event) {
    event.preventDefault()

    let username = this.refs.username
    let password = this.refs.password
    AppActions.login_with_password(username.value(), password.value())
  }

  handle_login_failure () {
    let password = this.refs.password
    if (password) { setTimeout(() => { password.focus() }, 200) }
  }
}

LoginForm.propTypes = {
  state: PropTypes.any
}

module.exports = LoginForm
