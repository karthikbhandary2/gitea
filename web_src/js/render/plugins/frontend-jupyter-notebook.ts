import type {FrontendRenderFunc} from '../plugin.ts';
import '../../../css/features/jupyter.css';

// Simple markdown to HTML converter for notebook cells using DOM methods
function renderMarkdown(markdown: string): HTMLElement {
  const container = document.createElement('div');
  
  // Split by lines and process
  const lines = markdown.split('\n');
  for (const line of lines) {
    let element: HTMLElement;
    
    // Headers
    if (line.startsWith('### ')) {
      element = document.createElement('h3');
      element.textContent = line.substring(4);
    } else if (line.startsWith('## ')) {
      element = document.createElement('h2');
      element.textContent = line.substring(3);
    } else if (line.startsWith('# ')) {
      element = document.createElement('h1');
      element.textContent = line.substring(2);
    } else {
      element = document.createElement('p');
      // Process inline formatting
      processInlineFormatting(element, line);
    }
    
    container.append(element);
  }
  
  return container;
}

// Process bold, italic, and inline code
function processInlineFormatting(element: HTMLElement, text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      element.append(strong);
    } else if (part.startsWith('*') && part.endsWith('*')) {
      const em = document.createElement('em');
      em.textContent = part.slice(1, -1);
      element.append(em);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      element.append(code);
    } else if (part) {
      element.append(document.createTextNode(part));
    }
  }
}


export const frontendRender: FrontendRenderFunc = async (opts) => {
  try {
    const notebook = JSON.parse(opts.contentString());

    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      throw new Error('Invalid notebook format: missing or invalid cells array');
    }

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
        prompt.textContent = `In [${cell.execution_count || executionCount}]:`;
        inputWrapper.append(prompt);

        const inputDiv = document.createElement('div');
        inputDiv.className = 'input';

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-python';
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
            outPrompt.textContent = `Out[${cell.execution_count || executionCount}]:`;
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
                  outputDiv.append(svgDiv);
                } else if (output.data['text/html']) {
                  const wrapperDiv = document.createElement('div');
                  wrapperDiv.style.overflowX = 'auto';
                  wrapperDiv.style.maxWidth = '100%';
                  const htmlDiv = document.createElement('div');
                  const htmlData = Array.isArray(output.data['text/html']) ?
                    output.data['text/html'].join('') : output.data['text/html'];
                  htmlDiv.innerHTML = htmlData;
                  // Ensure images inside HTML outputs are constrained
                  htmlDiv.querySelectorAll('img').forEach((img) => {
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                  });
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
              } else if (output.text) {
                const textPre = document.createElement('pre');
                const text = Array.isArray(output.text) ? output.text.join('') : output.text;
                textPre.textContent = text;
                outputDiv.append(textPre);
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
