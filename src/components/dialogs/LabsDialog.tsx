import { useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { GUIDED_LABS } from '../../labs/guidedLabs';
import { TOPOLOGY_TEMPLATES } from '../../labs/templates';
import { CHALLENGES } from '../../labs/challenges';
import type { LabValidation } from '../../labs/builders';
import { Icon } from '../common/Icon';

type Tab = 'labs' | 'templates' | 'challenges';

export function LabsDialog() {
  const adoptProject = useAppStore((state) => state.adoptProject);
  const setActiveLab = useAppStore((state) => state.setActiveLab);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const project = useAppStore((state) => state.project);
  const setStatusMessage = useAppStore((state) => state.setStatusMessage);
  const [tab, setTab] = useState<Tab>('labs');
  const [selectedId, setSelectedId] = useState(GUIDED_LABS[0]?.id ?? '');
  const [validation, setValidation] = useState<LabValidation | null>(null);

  const labs = GUIDED_LABS;
  const challenges = CHALLENGES;
  const templates = TOPOLOGY_TEMPLATES;

  const selectedLab = useMemo(() => labs.find((lab) => lab.id === selectedId) ?? labs[0], [labs, selectedId]);
  const selectedChallenge = useMemo(() => challenges.find((item) => item.id === selectedId) ?? challenges[0], [challenges, selectedId]);
  const selectedTemplate = useMemo(() => templates.find((item) => item.id === selectedId) ?? templates[0], [templates, selectedId]);

  const selectTab = (next: Tab) => {
    setTab(next);
    setValidation(null);
    if (next === 'labs') setSelectedId(labs[0]?.id ?? '');
    if (next === 'templates') setSelectedId(templates[0]?.id ?? '');
    if (next === 'challenges') setSelectedId(challenges[0]?.id ?? '');
  };

  const loadLab = () => {
    if (!selectedLab) return;
    adoptProject(selectedLab.build(), `Loaded lab: ${selectedLab.title}`);
    setActiveLab(selectedLab.id);
    closeDialog();
  };

  const loadChallenge = () => {
    if (!selectedChallenge) return;
    adoptProject(selectedChallenge.build(), `Loaded challenge: ${selectedChallenge.title}`);
    setActiveLab(selectedChallenge.id);
    closeDialog();
  };

  const loadTemplate = () => {
    if (!selectedTemplate) return;
    adoptProject(selectedTemplate.build(), `Loaded template: ${selectedTemplate.title}`);
    setActiveLab(null);
    closeDialog();
  };

  const validate = () => {
    if (tab === 'labs' && selectedLab) setValidation(selectedLab.validate(project));
    if (tab === 'challenges' && selectedChallenge) setValidation(selectedChallenge.validate(project));
    if (tab === 'templates') setStatusMessage('Templates do not define validation checks. Load one and explore it.');
  };

  const activeTitle = tab === 'labs' ? selectedLab?.title : tab === 'challenges' ? selectedChallenge?.title : selectedTemplate?.title;
  const activeSummary = tab === 'labs' ? selectedLab?.summary : tab === 'challenges' ? selectedChallenge?.brief : selectedTemplate?.description;

  return (
    <Dialog
      title="Learning Center"
      subtitle="Guided labs, ready-made topologies, and intentionally broken challenges. Everything works offline."
      onClose={closeDialog}
      width={900}
      className="labs-dialog"
      footer={(
        <>
          {tab !== 'templates' ? (
            <button type="button" className="secondary-button" onClick={validate}>
              <Icon name="check" size={14} /> Validate current project
            </button>
          ) : null}
          {validation ? (
            <span className={`validation-summary ${validation.passed ? 'is-pass' : 'is-fail'}`}>
              {validation.passed ? 'All checks passed' : `${validation.checks.filter((check) => !check.passed).length} checks failing`}
            </span>
          ) : null}
          <span className="footer-spacer" />
          <button type="button" className="secondary-button" onClick={closeDialog}>Close</button>
          <button
            type="button"
            className="primary-button"
            onClick={tab === 'labs' ? loadLab : tab === 'challenges' ? loadChallenge : loadTemplate}
          >
            {tab === 'templates' ? 'Load Template' : tab === 'labs' ? 'Start Lab' : 'Load Challenge'}
          </button>
        </>
      )}
    >
      <div className="segmented labs-tabs">
        <button type="button" className={tab === 'labs' ? 'is-active' : ''} onClick={() => selectTab('labs')}>
          Guided labs ({labs.length})
        </button>
        <button type="button" className={tab === 'templates' ? 'is-active' : ''} onClick={() => selectTab('templates')}>
          Templates ({templates.length})
        </button>
        <button type="button" className={tab === 'challenges' ? 'is-active' : ''} onClick={() => selectTab('challenges')}>
          Challenges ({challenges.length})
        </button>
      </div>

      <div className="labs-layout">
        <div className="labs-list">
          {tab === 'labs' ? labs.map((lab) => (
            <button
              key={lab.id}
              type="button"
              className={`lab-list-item ${selectedLab?.id === lab.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedId(lab.id);
                setValidation(null);
              }}
            >
              <span className="lab-title">{lab.title}</span>
              <span className={`difficulty difficulty-${lab.difficulty.toLowerCase()}`}>{lab.difficulty}</span>
            </button>
          )) : null}
          {tab === 'templates' ? templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`lab-list-item ${selectedTemplate?.id === template.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedId(template.id);
                setValidation(null);
              }}
            >
              <span className="lab-title">{template.title}</span>
              <span className="difficulty">Template</span>
            </button>
          )) : null}
          {tab === 'challenges' ? challenges.map((challenge) => (
            <button
              key={challenge.id}
              type="button"
              className={`lab-list-item ${selectedChallenge?.id === challenge.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedId(challenge.id);
                setValidation(null);
              }}
            >
              <span className="lab-title">{challenge.title}</span>
              <span className={`difficulty difficulty-${challenge.difficulty.toLowerCase()}`}>{challenge.difficulty}</span>
            </button>
          )) : null}
        </div>

        <div className="lab-detail">
          <h3>{activeTitle}</h3>
          <p className="lab-summary">{activeSummary}</p>

          {tab === 'labs' && selectedLab ? (
            <>
              <h4>Steps</h4>
              <ol className="lab-steps">
                {selectedLab.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <h4>Hints</h4>
              <ul className="lab-hints">
                {selectedLab.hints.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            </>
          ) : null}

          {tab === 'challenges' && selectedChallenge ? (
            <>
              <h4>Symptoms</h4>
              <ul className="lab-hints">
                {selectedChallenge.symptoms.map((symptom) => <li key={symptom}>{symptom}</li>)}
              </ul>
              <h4>Hints</h4>
              <ul className="lab-hints">
                {selectedChallenge.hints.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            </>
          ) : null}

          {tab === 'templates' ? (
            <p className="dialog-note">
              Loading a template replaces the current workspace. Save or export your project first if you want to keep it.
            </p>
          ) : null}

          {validation ? (
            <div className="validation-checks">
              {validation.checks.map((check) => (
                <div key={check.label} className={`validation-check ${check.passed ? 'is-pass' : 'is-fail'}`}>
                  <Icon name={check.passed ? 'check' : 'warning'} size={14} />
                  <span>{check.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dialog-note">
              Validation runs the real simulation engine against the current project and reports each requirement.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
