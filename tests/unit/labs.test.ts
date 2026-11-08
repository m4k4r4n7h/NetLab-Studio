import { describe, expect, it } from 'vitest';
import { GUIDED_LABS } from '../../src/labs/guidedLabs';
import { TOPOLOGY_TEMPLATES } from '../../src/labs/templates';
import { CHALLENGES } from '../../src/labs/challenges';
import { validateProject } from '../../src/storage/projectSerializer';

function expectValidProject(project: ReturnType<(typeof GUIDED_LABS)[number]['build']>): void {
  const result = validateProject(JSON.parse(JSON.stringify(project)));
  expect(result.ok).toBe(true);
}

describe('learning content inventory', () => {
  it('ships ten guided labs', () => {
    expect(GUIDED_LABS).toHaveLength(10);
    expect(new Set(GUIDED_LABS.map((lab) => lab.id)).size).toBe(10);
    for (const lab of GUIDED_LABS) {
      expect(lab.steps.length).toBeGreaterThan(0);
      expect(lab.hints.length).toBeGreaterThan(0);
    }
  });

  it('ships six topology templates', () => {
    expect(TOPOLOGY_TEMPLATES).toHaveLength(6);
    expect(new Set(TOPOLOGY_TEMPLATES.map((template) => template.id)).size).toBe(6);
    for (const template of TOPOLOGY_TEMPLATES) {
      expect(template.description.length).toBeGreaterThan(0);
    }
  });

  it('ships six troubleshooting challenges', () => {
    expect(CHALLENGES).toHaveLength(6);
    expect(new Set(CHALLENGES.map((challenge) => challenge.id)).size).toBe(6);
    for (const challenge of CHALLENGES) {
      expect(challenge.symptoms.length).toBeGreaterThan(0);
      expect(challenge.hints.length).toBeGreaterThan(0);
    }
  });
});

describe('learning content projects', () => {
  it('builds every guided lab as a valid project', () => {
    for (const lab of GUIDED_LABS) {
      expectValidProject(lab.build());
    }
  });

  it('builds every template as a valid project', () => {
    for (const template of TOPOLOGY_TEMPLATES) {
      expectValidProject(template.build());
    }
  });

  it('builds every challenge as a valid project', () => {
    for (const challenge of CHALLENGES) {
      expectValidProject(challenge.build());
    }
  });

  it('validates already-solved starter labs', () => {
    const basic = GUIDED_LABS.find((lab) => lab.id === 'basic-lan');
    const connected = GUIDED_LABS.find((lab) => lab.id === 'connected-routes');
    expect(basic).toBeDefined();
    expect(connected).toBeDefined();
    if (!basic || !connected) return;
    expect(basic.validate(basic.build()).passed).toBe(true);
    expect(connected.validate(connected.build()).passed).toBe(true);
  });

  it('reports failing checks for unsolved labs and challenges', () => {
    const dnsLab = GUIDED_LABS.find((lab) => lab.id === 'configure-dns');
    const wrongGateway = CHALLENGES.find((challenge) => challenge.id === 'challenge-gateway');
    expect(dnsLab).toBeDefined();
    expect(wrongGateway).toBeDefined();
    if (!dnsLab || !wrongGateway) return;
    const dnsValidation = dnsLab.validate(dnsLab.build());
    expect(dnsValidation.passed).toBe(false);
    expect(dnsValidation.checks.some((entry) => !entry.passed)).toBe(true);
    const challengeValidation = wrongGateway.validate(wrongGateway.build());
    expect(challengeValidation.passed).toBe(false);
  });
});
