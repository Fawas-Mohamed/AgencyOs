import { randomUUID } from 'node:crypto';
import { ClientHubService } from './client-hub.service';
import { FilesService } from './files.service';
import { AccessService } from './access.service';
import { PrivateStorage } from './private-storage';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/auth';
import {
  ClientQuery,
  CommunicationQuery,
  CreateClientDto,
  CreateCommunicationDto,
  CreateNoteDto,
  FileLinkDto,
  FileQuery,
  FileUploadDto,
  NoteQuery,
  PageQuery,
  UpdateClientDto,
} from './dto/hub.dto';

describe('supporting service permission boundary', () => {
  const actor: Actor = {
    userId: randomUUID(),
    agencyId: randomUUID(),
    displayName: 'Denied',
    email: 'denied@example.com',
    role: 'No access',
    permissions: [],
  };
  const id = randomUUID();
  const prisma = {} as PrismaService;
  const access = {} as AccessService;
  const read = jest.fn();
  const put = jest.fn();
  const storage = { read, put } as unknown as PrivateStorage;
  const hub = new ClientHubService(prisma, access);
  const files = new FilesService(prisma, access, storage);
  const operations = {
    clients: () => hub.clients(actor, new ClientQuery()),
    createClient: () => hub.createClient(actor, new CreateClientDto()),
    updateClient: () => hub.updateClient(actor, id, new UpdateClientDto()),
    hub: () => hub.hub(actor, id),
    communications: () => hub.communications(actor, id, new CommunicationQuery()),
    createCommunication: () => hub.createCommunication(actor, id, new CreateCommunicationDto()),
    notes: () => hub.notes(actor, id, new NoteQuery()),
    createNote: () => hub.createNote(actor, id, new CreateNoteDto()),
    timeline: () => hub.timeline(actor, id, new PageQuery()),
    listFiles: () => files.list(actor, id, new FileQuery()),
    reference: () => files.createLink(actor, id, new FileLinkDto()),
    upload: () => files.upload(actor, id, new FileUploadDto()),
    download: () => files.download(actor, id),
    archive: () => files.archive(actor, id),
  };
  it.each(Object.keys(operations) as (keyof typeof operations)[])(
    'requires permissions before %s accesses records or private storage',
    async (name) => {
      await expect(operations[name]()).rejects.toMatchObject({ status: 403 });
      expect(read).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    },
  );
});
