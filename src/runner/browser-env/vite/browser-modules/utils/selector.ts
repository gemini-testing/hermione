export const getSelectorTextFromShadowRoot = (selector: string, shadowRoot: ShadowRoot): string => {
    return (shadowRoot.querySelector(selector) as HTMLElement).innerText;
};
