import type {FrontendRenderFunc} from '../plugin.ts';
import {marked} from 'marked';
import '../../../css/features/jupyter.css';

// Sanitize HTML by removing dangerous attributes and elements
function sanitizeHtml(element: HTMLElement) {
  const dangerousAttrs = ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmousemove',
    'onmouseenter', 'onmouseleave', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown',
    'onkeyup', 'onkeypress', 'onanimationstart', 'onanimationend', 'onbegin', 'onend', 'onrepeat'];

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodes.push(node as Element);
  }

  for (const el of nodes) {
    // Remove all on* event handlers
    for (const attr of dangerousAttrs) {
      el.removeAttribute(attr);
    }

    // Remove javascript: and data: URLs from href and src
    const urlPattern = /^(javascript|data):/;
    const href = el.getAttribute('href');
    if (href && urlPattern.test(href.toLowerCase().trim())) {
      el.removeAttribute('href');
    }
    const src = el.getAttribute('src');
    if (src && urlPattern.test(src.toLowerCase().trim())) {
      el.removeAttribute('src');
    }

    // Remove <script>, <iframe>, and <foreignObject> elements (SVG can embed HTML via foreignObject)
    if (el.tagName === 'SCRIPT' || el.tagName === 'IFRAME' || el.tagName === 'foreignObject') {
      el.remove();
    }
  }
}

// Render markdown using marked library
function renderMarkdown(markdown: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = marked.parse(markdown) as string;
  sanitizeHtml(container);
  return container;
}

export const frontendRender: FrontendRenderFunc = async (opts) => {
  try {
    const notebook = JSON.parse(opts.contentString());

    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      throw new Error('Invalid notebook format: missing or invalid cells array');
    }

    // Detect language from notebook metadata
    const language = notebook.metadata?.language_info?.name ||
                     notebook.metadata?.kernelspec?.language ||
                     'text';

    const container = document.createElement('div');
    container.className = 'jupyter-notebook';

    let executionCount = 1;

    for (const cell of notebook.cells) {
      if (!cell.cell_type) continue;

      const cellDiv = document.createElement('div');
      cellDiv.className = `cell ${cell.cell_type}`;

      if (cell.cell_type === 'markdown') {
        const inputDiv = document.createElement('div');
        inputDiv.className = 'input markup';
        const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
        inputDiv.append(renderMarkdown(source));
        cellDiv.append(inputDiv);
      } else if (cell.cell_type === 'code') {
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'input-wrapper';

        const prompt = document.createElement('div');
        prompt.className = 'prompt input-prompt';
        prompt.textContent = `In [${cell.execution_count ?? executionCount}]:`;
        inputWrapper.append(prompt);

        const inputDiv = document.createElement('div');
        inputDiv.className = 'input';

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = `language-${language}`;
        const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
        code.textContent = source;
        pre.append(code);
        inputDiv.append(pre);
        inputWrapper.append(inputDiv);
        cellDiv.append(inputWrapper);

        if (cell.outputs && Array.isArray(cell.outputs) && cell.outputs.length > 0) {
          const outputWrapper = document.createElement('div');
          outputWrapper.className = 'output-wrapper';

          const hasExecutionResult = cell.outputs.some((o: any) => o.output_type === 'execute_result');

          const outPrompt = document.createElement('div');
          outPrompt.className = 'prompt output-prompt';
          if (hasExecutionResult) {
            outPrompt.textContent = `Out[${cell.execution_count ?? executionCount}]:`;
          }
          outputWrapper.append(outPrompt);

          const outputDiv = document.createElement('div');
          outputDiv.className = 'output';

          for (const output of cell.outputs) {
            try {
              if (output.data) {
                if (output.data['image/png']) {
                  const img = document.createElement('img');
                  const imgData = Array.isArray(output.data['image/png']) ?
                    output.data['image/png'].join('') : output.data['image/png'];
                  img.src = `data:image/png;base64,${imgData}`;
                  img.style.maxWidth = '100%';
                  outputDiv.append(img);
                } else if (output.data['image/jpeg']) {
                  const img = document.createElement('img');
                  const imgData = Array.isArray(output.data['image/jpeg']) ?
                    output.data['image/jpeg'].join('') : output.data['image/jpeg'];
                  img.src = `data:image/jpeg;base64,${imgData}`;
                  img.style.maxWidth = '100%';
                  outputDiv.append(img);
                } else if (output.data['image/svg+xml']) {
                  const svgDiv = document.createElement('div');
                  const svgData = Array.isArray(output.data['image/svg+xml']) ?
                    output.data['image/svg+xml'].join('') : output.data['image/svg+xml'];
                  svgDiv.innerHTML = svgData;
                  sanitizeHtml(svgDiv);
                  outputDiv.append(svgDiv);
                } else if (output.data['text/html']) {
                  const wrapperDiv = document.createElement('div');
                  wrapperDiv.style.overflowX = 'auto';
                  wrapperDiv.style.maxWidth = '100%';
                  const htmlDiv = document.createElement('div');
                  const htmlData = Array.isArray(output.data['text/html']) ?
                    output.data['text/html'].join('') : output.data['text/html'];
                  htmlDiv.innerHTML = htmlData;
                  sanitizeHtml(htmlDiv);
                  // Ensure images inside HTML outputs are constrained
                  for (const img of htmlDiv.querySelectorAll('img')) {
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                  }
                  wrapperDiv.append(htmlDiv);
                  outputDiv.append(wrapperDiv);
                } else if (output.data['application/javascript']) {
                  const jsDiv = document.createElement('div');
                  jsDiv.className = 'js-output-warning';
                  jsDiv.textContent = '[JavaScript output - execution disabled for security]';
                  jsDiv.style.color = 'var(--color-text-light-2)';
                  jsDiv.style.fontStyle = 'italic';
                  outputDiv.append(jsDiv);
                } else if (output.data['application/vnd.plotly.v1+json']) {
                  const plotlyDiv = document.createElement('div');
                  plotlyDiv.className = 'plotly-output-warning';
                  plotlyDiv.textContent = '[Plotly output - interactive plots not supported]';
                  plotlyDiv.style.color = 'var(--color-text-light-2)';
                  plotlyDiv.style.fontStyle = 'italic';
                  outputDiv.append(plotlyDiv);
                } else if (output.data['application/vnd.jupyter.widget-view+json']) {
                  const widgetDiv = document.createElement('div');
                  widgetDiv.className = 'widget-output-warning';
                  widgetDiv.textContent = '[Jupyter widget - interactive widgets not supported]';
                  widgetDiv.style.color = 'var(--color-text-light-2)';
                  widgetDiv.style.fontStyle = 'italic';
                  outputDiv.append(widgetDiv);
                } else if (output.data['text/latex']) {
                  const latex = Array.isArray(output.data['text/latex']) ?
                    output.data['text/latex'].join('') : output.data['text/latex'];
                  const pre = document.createElement('pre');
                  const mathCode = document.createElement('code');
                  mathCode.className = 'language-math display';
                  mathCode.textContent = latex.replace(/^\$\$|\$\$$/g, '');
                  pre.append(mathCode);
                  outputDiv.append(pre);
                } else if (output.data['text/plain']) {
                  const textPre = document.createElement('pre');
                  const plainText = Array.isArray(output.data['text/plain']) ?
                    output.data['text/plain'].join('') : output.data['text/plain'];
                  textPre.textContent = plainText;
                  outputDiv.append(textPre);
                }
              } else if (output.output_type === 'stream' && output.name) {
                const streamPre = document.createElement('pre');
                streamPre.className = `stream-${output.name}`;
                const streamText = Array.isArray(output.text) ? output.text.join('') : (output.text || '');
                streamPre.textContent = streamText;
                outputDiv.append(streamPre);
              } else if (output.output_type === 'error') {
                const errorPre = document.createElement('pre');
                errorPre.className = 'error-output';
                errorPre.style.color = 'var(--color-red)';
                const traceback = Array.isArray(output.traceback) ? output.traceback.join('\n') :
                  (output.ename && output.evalue ? `${output.ename}: ${output.evalue}` : 'Error');
                errorPre.textContent = traceback;
                outputDiv.append(errorPre);
              } else if (output.text) {
                const textPre = document.createElement('pre');
                const text = Array.isArray(output.text) ? output.text.join('') : output.text;
                textPre.textContent = text;
                outputDiv.append(textPre);
              }
            } catch (outputError) {
              console.warn('Failed to render output:', outputError);
              const errorDiv = document.createElement('div');
              errorDiv.textContent = '[Output rendering failed]';
              errorDiv.style.color = 'var(--color-text-light-2)';
              errorDiv.style.fontStyle = 'italic';
              outputDiv.append(errorDiv);
            }
          }

          if (outputDiv.children.length > 0) {
            outputWrapper.append(outputDiv);
            cellDiv.append(outputWrapper);
          }
        }

        executionCount++;
      }

      container.append(cellDiv);
    }

    opts.container.append(container);

    const {initMarkupCodeMath} = await import('../../markup/math.ts');
    await initMarkupCodeMath(container);

    return true;
  } catch (error) {
    console.error('Jupyter notebook rendering failed:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.padding = '20px';
    errorDiv.style.color = 'var(--color-red)';
    const errorTitle = document.createElement('strong');
    errorTitle.textContent = 'Failed to render notebook:';
    errorDiv.append(errorTitle);
    errorDiv.append(document.createElement('br'));
    const errorMessage = error instanceof Error ? error.message : String(error);
    errorDiv.append(document.createTextNode(errorMessage));
    opts.container.append(errorDiv);
    return false;
  }
};
