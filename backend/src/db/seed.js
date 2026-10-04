const DEMO_REQUESTS = [
  {
    type: 'petition',
    subject: 'Copy of my property tax certificate',
    description: 'I need an official copy of my property tax certificate to complete a bank loan.',
    requesterName: 'Ana Gomez',
    requesterEmail: 'ana.gomez@example.com',
  },
  {
    type: 'complaint',
    subject: 'Long waiting time at the main office',
    description: 'I waited more than three hours to be served and nobody explained the delay.',
    requesterName: 'Luis Perez',
    requesterEmail: 'luis.perez@example.com',
  },
  {
    type: 'claim',
    subject: 'Wrong amount on my water invoice',
    description: 'My last invoice shows a consumption that is three times higher than usual.',
    requesterName: 'Maria Lopez',
    requesterEmail: 'maria.lopez@example.com',
  },
  {
    type: 'suggestion',
    subject: 'Add a ramp at the west entrance',
    description: 'A ramp would help people with reduced mobility and parents with strollers.',
    requesterName: 'Carlos Ruiz',
    requesterEmail: 'carlos.ruiz@example.com',
  },
  {
    type: 'petition',
    subject: 'Information about public tenders',
    description: 'Please send me the list of public tenders opened during the last six months.',
    requesterName: 'Sofia Torres',
    requesterEmail: 'sofia.torres@example.com',
  },
  {
    type: 'complaint',
    subject: 'Street light out for two weeks',
    description:
      'The street light in front of number 14 has been off since the beginning of the month.',
    requesterName: 'Jorge Diaz',
    requesterEmail: 'jorge.diaz@example.com',
  },
  {
    type: 'claim',
    subject: 'Double charge on a service fee',
    description: 'I was charged twice for the same service fee and I have both receipts.',
    requesterName: 'Laura Castro',
    requesterEmail: 'laura.castro@example.com',
  },
  {
    type: 'suggestion',
    subject: 'Send reminders by email',
    description: 'It would be useful to receive an email reminder before an appointment expires.',
    requesterName: 'Pedro Silva',
    requesterEmail: 'pedro.silva@example.com',
  },
];

/**
 * Creates the demo requests through the repository and returns them.
 * Handy for screenshots and for trying the lookup and the staff panel.
 */
export function seedDemoData(repository, { now = new Date() } = {}) {
  return DEMO_REQUESTS.map((request) => repository.create(request, { now }));
}
