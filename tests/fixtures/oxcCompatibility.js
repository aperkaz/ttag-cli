import { t as translate, gettext as get, ngettext, msgid, c as context } from "ttag";
const { jt: jsxTranslate } = require("ttag");

translate`aliased ${user.name}`;
get("function message");
context("menu").t`context message`;
context("menu").gettext("context function");
ngettext(msgid`${count} item`, `${count} items`, `${count} many items`, count);
jsxTranslate`computed ${items[index]}`;
