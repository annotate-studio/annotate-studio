'use client';

import React, { memo } from 'react';
import { AlertTriangle, Check, HelpCircle, Lightbulb } from 'lucide-react';
import type { Visualization } from '@/lib/visualizations';

function Empty({ label = 'Nothing specific' }: { label?: string }) {
  return <li className="viz-muted" dir="auto">{label}</li>;
}

function BulletList({ title, items }: { title?: string; items: string[] }) {
  return (
    <div className="viz viz-bullets">
      {title && <div className="viz-title">{title}</div>}
      <ul>
        {items.length === 0 && <Empty />}
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`} dir="auto">
            <span className="viz-bullet-icon">
              <Check size={11} strokeWidth={2.5} />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VennDiagram({ data }: { data: Extract<Visualization, { type: 'venn_diagram' }> }) {
  const columns = [
    { key: 'a', heading: data.subjectA, subheading: 'only', items: data.uniqueA },
    { key: 'both', heading: 'Shared', subheading: '', items: data.overlap },
    { key: 'b', heading: data.subjectB, subheading: 'only', items: data.uniqueB },
  ];
  return (
    <div className="viz viz-venn">
      <div className="venn-stage">
        <div className="venn-circle venn-circle-a" />
        <div className="venn-circle venn-circle-b" />
        <span className="venn-label venn-label-a" dir="auto">
          {data.subjectA}
        </span>
        <span className="venn-label venn-label-b" dir="auto">
          {data.subjectB}
        </span>
      </div>
      <div className="venn-columns">
        {columns.map((column) => (
          <div key={column.key} className={`venn-column venn-column-${column.key}`}>
            <div className="venn-column-title" dir="auto">
              {column.heading}
              {column.subheading && <small> {column.subheading}</small>}
            </div>
            <ul>
              {column.items.length === 0 && <Empty />}
              {column.items.map((item, index) => (
                <li key={`${index}-${item.slice(0, 24)}`} dir="auto">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Timeline({ events }: { events: Extract<Visualization, { type: 'timeline' }>['events'] }) {
  return (
    <div className="viz viz-timeline">
      <div className="timeline-track">
        {events.map((event, index) => (
          <div className="timeline-item" key={`${index}-${event.title.slice(0, 24)}`}>
            <span className="timeline-date" dir="auto">
              {event.date || '—'}
            </span>
            <span className="timeline-node" />
            <div className="timeline-card">
              <strong dir="auto">{event.title}</strong>
              {event.description && <p dir="auto">{event.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MindMap({ data }: { data: Extract<Visualization, { type: 'mindmap' }> }) {
  return (
    <div className="viz viz-mindmap">
      <div className="mindmap-root" dir="auto">
        {data.root}
      </div>
      <div className="mindmap-branches">
        {data.branches.map((branch, index) => (
          <div className="mindmap-branch" key={`${index}-${branch.name}`}>
            <div className="mindmap-branch-name" dir="auto">
              {branch.name}
            </div>
            <ul>
              {branch.children.length === 0 && <Empty />}
              {branch.children.map((child, childIndex) => (
                <li key={`${childIndex}-${child.slice(0, 24)}`} dir="auto">
                  {child}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function QaGrid({ data }: { data: Extract<Visualization, { type: 'qa_grid' }> }) {
  const columns = [
    { key: 'why', title: 'Why?', icon: <Lightbulb size={13} />, items: data.why_questions },
    { key: 'how', title: 'How?', icon: <HelpCircle size={13} />, items: data.how_questions },
  ];
  return (
    <div className="viz viz-qa">
      {columns.map((column) => (
        <div className={`qa-column qa-column-${column.key}`} key={column.key}>
          <div className="qa-title">
            {column.icon} {column.title}
          </div>
          <ol>
            {column.items.length === 0 && <Empty label="No questions" />}
            {column.items.map((question, index) => (
              <li key={`${index}-${question.slice(0, 24)}`} dir="auto">
                {question}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function CheatSheet({ data }: { data: Extract<Visualization, { type: 'cheat_sheet' }> }) {
  return (
    <div className="viz viz-cheat">
      {(data.title || data.core) && (
        <div className="cheat-head">
          {data.title && <div className="viz-title" dir="auto">{data.title}</div>}
          {data.core && (
            <div className="cheat-core" dir="auto">
              {data.core}
            </div>
          )}
        </div>
      )}
      {data.facts.length > 0 && (
        <section className="cheat-section">
          <h5>Key facts</h5>
          <ul>
            {data.facts.map((fact, index) => (
              <li key={`${index}-${fact.slice(0, 24)}`} dir="auto">
                {fact}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.terms.length > 0 && (
        <section className="cheat-section">
          <h5>Terms</h5>
          <dl>
            {data.terms.map((term, index) => (
              <React.Fragment key={`${index}-${term.term}`}>
                <dt dir="auto">{term.term}</dt>
                <dd dir="auto">{term.definition}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}
      {data.example && (
        <section className="cheat-section cheat-example">
          <h5>Example</h5>
          <p dir="auto">{data.example}</p>
        </section>
      )}
      {!data.core && data.facts.length === 0 && data.terms.length === 0 && !data.example && (
        <p className="viz-muted">This cheat sheet came back empty.</p>
      )}
    </div>
  );
}

function FallacyList({ fallacies }: { fallacies: Extract<Visualization, { type: 'fallacy_list' }>['fallacies'] }) {
  if (fallacies.length === 0) {
    return (
      <div className="viz viz-fallacies">
        <p className="viz-muted" dir="auto">
          No contradictions or logical fallacies were found in this text.
        </p>
      </div>
    );
  }
  return (
    <div className="viz viz-fallacies">
      {fallacies.map((fallacy, index) => (
        <div className="fallacy-card" key={`${index}-${fallacy.fallacy_type}`}>
          <div className="fallacy-top">
            <AlertTriangle size={13} />
            <span className="fallacy-type" dir="auto">
              {fallacy.fallacy_type || 'Logical flaw'}
            </span>
            <span className="fallacy-index">#{index + 1}</span>
          </div>
          {fallacy.claim && (
            <p className="fallacy-claim" dir="auto">
              {fallacy.claim}
            </p>
          )}
          {fallacy.explanation && (
            <p className="fallacy-explanation" dir="auto">
              {fallacy.explanation}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function VisualizationView({ data }: { data: Visualization }) {
  switch (data.type) {
    case 'text':
      return (
        <div className="viz viz-text">
          <p dir="auto">{data.content}</p>
        </div>
      );
    case 'bullet_list':
      return <BulletList title={data.title} items={data.items} />;
    case 'venn_diagram':
      return <VennDiagram data={data} />;
    case 'timeline':
      return <Timeline events={data.events} />;
    case 'mindmap':
      return <MindMap data={data} />;
    case 'qa_grid':
      return <QaGrid data={data} />;
    case 'cheat_sheet':
      return <CheatSheet data={data} />;
    case 'fallacy_list':
      return <FallacyList fallacies={data.fallacies} />;
    default:
      return null;
  }
}

export default memo(VisualizationView);
