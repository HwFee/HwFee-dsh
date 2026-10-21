/**
 * The browser half of `@hwfee/dsh-predict`.
 *
 * It owns two surfaces: the ghost text in the composer, and one settings row.
 * The model call happens on the Host, through the same `ctx.llm` service the
 * conversation itself uses.
 */

import { PLUGIN_ID } from './constants.js'
import { createLifecycle } from './lifecycle.js'

export const name = PLUGIN_ID

export const inject = ['slots', 'locale', 'connection', 'sessions', 'uiSession', 'remote']

let React = null
try { React = require('react') } catch (error) { React = null }

let primitives = null
try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

export const apply = React === null
  ? function applyWithoutReact() {}
  : createLifecycle({ React, primitives })
