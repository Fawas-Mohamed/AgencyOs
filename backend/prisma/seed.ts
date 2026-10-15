import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClientHubService } from '../src/client-hub/client-hub.service';
import { RequirementsService } from '../src/client-hub/requirements.service';
import { Actor, PERMISSIONS } from '../src/common/auth';
import { hashPassword } from '../src/common/password';
import { RequirementContentDto } from '../src/client-hub/dto/hub.dto';
async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_AUTH_ENABLED !== 'true') throw new Error('Local demonstration seed must be explicitly enabled');
  const email = process.env.DEMO_EMAIL?.toLowerCase();
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Configure DEMO_EMAIL and a random DEMO_PASSWORD of at least 12 characters');
  const app = await NestFactory.createApplicationContext(AppModule,{logger:false});
  try {
    const prisma = app.get(PrismaService);
    let user = await prisma.user.findUnique({where:{email},include:{agency:true,role:true}});
    if (user && user.agency.name !== 'Agency OS local demonstration') throw new Error('Existing account is outside the demo adapter; it has been preserved');
    if (!user) {
      for (const key of PERMISSIONS) await prisma.permission.upsert({where:{key},update:{},create:{key,description:key}});
      const agency = await prisma.agency.create({data:{name:'Agency OS local demonstration'}});
      const role = await prisma.role.create({data:{agencyId:agency.id,name:'Agency administrator',permissions:{create:PERMISSIONS.map(permissionKey=>({permissionKey}))}}});
      user = await prisma.user.create({data:{agencyId:agency.id,roleId:role.id,email,displayName:'Demo reviewer',passwordHash:hashPassword(password)},include:{agency:true,role:true}});
    }
    if (await prisma.client.count({where:{agencyId:user.agencyId}})) { console.log('Existing demonstration data preserved.'); return; }
    const actor: Actor = {userId:user.id,agencyId:user.agencyId,email:user.email,displayName:user.displayName,role:user.role.name,permissions:[...PERMISSIONS]};
    const hub = app.get(ClientHubService);
    const requirements = app.get(RequirementsService);
    const client = await hub.createClient(actor,{name:'Ceylon Craft Studio',company:'Ceylon Craft Studio (Pvt) Ltd',contactName:'Amaya Perera',email:'amaya@example.com',phone:'+94 77 000 0000',website:'https://example.com'});
    await hub.createClient(actor,{name:'Northline Consulting',company:'Northline Consulting',contactName:'Ravi Silva',email:'ravi@example.com'});
    const content = Object.assign(new RequirementContentDto(),{
      title:'Client portal and onboarding',objective:'Give clients one place to submit briefs and track approvals.',
      services:['UX design','Web application'],designPreferences:'Clear navigation, accessible forms and restrained colors.',
      budgetMin:'300000.00',budgetMax:'500000.00',currency:'LKR',timeline:'Client preference: initial release within eight weeks.',
      constraints:'Client will provide approved content.',assumptions:'Internal assumption: identity provider supports JWT.',
      clientNotes:'Client estimates are subject to review.',referenceLinks:['https://example.com'],
      items:[{title:'Guided onboarding',description:'Collect company profile and project brief.',category:'Feature',priority:'MUST_HAVE',notes:''},{title:'Approval history',description:'Show agreed versions and responsible reviewers.',category:'Feature',priority:'HIGH',notes:''}],
    });
    const first = await requirements.create(actor,client.id,content);
    await requirements.changeStatus(actor,first.id,{status:'UNDER_REVIEW',expectedVersion:first.lockVersion});
    await requirements.changeStatus(actor,first.id,{status:'CONFIRMED',expectedVersion:first.lockVersion+1});
    await requirements.create(actor,client.id,Object.assign(new RequirementContentDto(),content,{title:'Website accessibility review',objective:'Identify barriers in the current public website.',budgetMin:null,budgetMax:null,currency:null,items:[{title:'Accessibility assessment',description:'Review navigation, forms and content structure.',category:'Audit',priority:'HIGH',notes:''}]}));
    await hub.createNote(actor,client.id,{body:'Internal context: confirm the primary decision maker before the next review.'});
    await hub.createCommunication(actor,client.id,{type:'MEETING',subject:'Discovery discussion',summary:'Discussed onboarding priorities and approval history.',participants:['Amaya Perera','Demo reviewer'],followUp:'Prepare the first requirement review.',occurredAt:new Date().toISOString(),requirementId:first.id});
    console.log('Seeded demonstration clients, draft and confirmed requirements, notes, communication and timeline. Existing data was not reset.');
  } finally { await app.close(); }
}
seed().catch(()=>{console.error('Seed failed; check configuration and database availability. Existing records were not reset.');process.exitCode=1;});
