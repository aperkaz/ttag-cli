// @flow
import React from "react";
import { t } from "ttag";

export value from "./globalFunc";

@component
class Greeting extends React.Component<{ name?: string }> {
    render() {
        const name = this.props?.name ?? "world";
        return <span>{t`hello ${name}`}</span>;
    }
}
