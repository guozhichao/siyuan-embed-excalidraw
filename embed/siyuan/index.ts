import { HTMLToElement } from "../../src/utils";

const urlParams = new URLSearchParams(window.location.search);
const blockID = urlParams.get('id');

if (blockID) {
  const siyuanIframe = document.createElement('iframe');
  siyuanIframe.src = `/stage/build/desktop/?id=${blockID}&focus=1`;
  siyuanIframe.onload = (event: Event) => {
    const iframe = event.target as HTMLIFrameElement;
    const styleElement = HTMLToElement(`<style>
  #toolbar,
  #status,
  #message,
  #dockBottom, #dockLeft, #dockRight,
  .layout__dockl, .layout__dockr,
  .layout__wnd--active >:first-child,
  .protyle-breadcrumb,
  .protyle-top >:not(.protyle-title),
  .protyle-content >:not(.protyle-top):not(.protyle-wysiwyg),
  .layout__resize--lr, .layout__resize,
  .layout__center >:not(:first-child),
  .layout__center >:first-child:not(.layout__wnd--active) >:not(:first-child),
  .layout__center >:first-child:not(.layout__wnd--active) >:first-child:not(.layout__wnd--active) >:not(:first-child),
  .protyle-title:not([data-node-id="${blockID}"]) {
    display: none;
  }
  .protyle,
  .layout-tab-container,
  #layouts >:first-child,
  .protyle-content:not(:hover) {
    overflow: hidden;
  }
</style>`);
    iframe.contentDocument?.head.appendChild(styleElement);
  };
  document.getElementById('root')?.append(siyuanIframe);
}
