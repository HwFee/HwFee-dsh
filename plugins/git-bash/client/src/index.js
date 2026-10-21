/**
 * The browser half of `@hwfee/dsh-git-bash`.
 *
 * It contributes ONE settings row: which shell is in use, and whether the
 * platform's own shell tool stays exposed. No card, no tool view — the shell
 * itself runs on the Host.
 *
 * React comes from the host's frozen module table; it is absent in a Node
 * import (the unit tests load this file for its `name`), so the entry degrades
 * to a no-op apply instead of throwing.
 */

import { PLUGIN_ID } from './constants.js'
import { createLifecycle } from './lifecycle.js'

export const name = PLUGIN_ID

/** `slots` and `locale` are the two services the row needs. */
export const inject = ['slots', 'locale']

let React = null
try { React = require('react') } catch (error) { React = null }

let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

export const apply = React === null
  ? function applyWithoutReact() {}
  : createLifecycle({ React, primitives })
