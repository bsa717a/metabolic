import { sanitizeCommunicationHtmlClient } from './sanitizeHtmlClient';

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `id${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

/**
 * Wrap raw HTML into a minimal Unlayer design so it can be loaded into the email
 * builder as an editable HTML content block.
 */
export const buildDesignFromHtml = (html: string): Record<string, unknown> => {
  const safeHtml = sanitizeCommunicationHtmlClient(html);

  return {
    counters: {
      u_row: 1,
      u_column: 1,
      u_content_html: 1
    },
    body: {
      id: generateId(),
      rows: [
        {
          id: generateId(),
          cells: [1],
          columns: [
            {
              id: generateId(),
              contents: [
                {
                  id: generateId(),
                  type: 'html',
                  values: {
                    html: safeHtml,
                    hideDesktop: false,
                    displayCondition: null,
                    containerPadding: '10px',
                    anchor: '',
                    _meta: {
                      htmlID: 'u_content_html_1',
                      htmlClassNames: 'u_content_html'
                    },
                    selectable: true,
                    draggable: true,
                    duplicatable: true,
                    deletable: true,
                    hideable: true
                  }
                }
              ],
              values: {
                backgroundColor: '',
                padding: '0px',
                border: {},
                borderRadius: '0px',
                _meta: {
                  htmlID: 'u_column_1',
                  htmlClassNames: 'u_column'
                }
              }
            }
          ],
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: {
              url: '',
              fullWidth: true,
              repeat: 'no-repeat',
              size: 'custom',
              position: 'center'
            },
            padding: '0px',
            anchor: '',
            _meta: {
              htmlID: 'u_row_1',
              htmlClassNames: 'u_row'
            },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideable: true
          }
        }
      ],
      values: {
        popupPosition: 'center',
        popupWidth: '600px',
        popupHeight: 'auto',
        borderRadius: '10px',
        contentAlign: 'center',
        contentVerticalAlign: 'center',
        contentWidth: '600px',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        popupBackgroundColor: '#FFFFFF',
        popupBackgroundImage: {
          url: '',
          fullWidth: true,
          repeat: 'no-repeat',
          size: 'cover',
          position: 'center'
        },
        popupOverlay_backgroundColor: 'rgba(0, 0, 0, 0.1)',
        popupCloseButton_position: 'top-right',
        popupCloseButton_backgroundColor: '#DDDDDD',
        popupCloseButton_iconColor: '#000000',
        popupCloseButton_borderRadius: '0px',
        popupCloseButton_margin: '0px',
        popupCloseButton_action: {
          name: 'close_popup',
          attrs: {
            onClick: "document.querySelector('.u-popup-container').style.display = 'none';"
          }
        },
        backgroundColor: '#F7F8F9',
        backgroundImage: {
          url: '',
          fullWidth: true,
          repeat: 'no-repeat',
          size: 'custom',
          position: 'center'
        },
        preheaderText: '',
        linkStyle: {
          body: true,
          linkColor: '#0000ee',
          linkHoverColor: '#0000ee',
          linkUnderline: true,
          linkHoverUnderline: true
        },
        _meta: {
          htmlID: 'u_body',
          htmlClassNames: 'u_body'
        }
      }
    },
    schemaVersion: 16
  };
};
