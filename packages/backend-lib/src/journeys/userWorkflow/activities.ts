import { SegmentAssignment } from "@prisma/client";
import escapeHTML from "escape-html";
import { renderWithUserProperties } from "isomorphic-lib/src/liquid";

import { sendMail as sendEmailSendgrid } from "../../destinations/sendgrid";
import prisma from "../../prisma";
import {
  EmailProviderType,
  InternalEventType,
  JourneyNode,
  JourneyNodeType,
  MessageNodeVariantType,
} from "../../types";
import { trackInternalEvents } from "../../userEvents";
import { findAllUserPropertyAssignments } from "../../userProperties";

export { findAllUserPropertyAssignments } from "../../userProperties";

// TODO implement more sophisticated error handing
export async function sendEmail({
  journeyId,
  templateId,
  workspaceId,
  userId,
  runId,
  nodeId,
  messageId,
}: {
  userId: string;
  workspaceId: string;
  runId: string;
  nodeId: string;
  templateId: string;
  journeyId: string;
  messageId: string;
}): Promise<boolean> {
  const journey = await prisma.journey.findUnique({
    where: {
      id: journeyId,
    },
  });
  if (!journey || journey.status !== "Running") {
    return false;
  }

  const [defaultEmailProvider, emailTemplate, userProperties] =
    await Promise.all([
      prisma.defaultEmailProvider.findUnique({
        where: {
          workspaceId,
        },
        include: { emailProvider: true },
      }),
      prisma.emailTemplate.findUnique({
        where: {
          id: templateId,
        },
      }),
      findAllUserPropertyAssignments({
        userId,
      }),
    ]);

  if (!emailTemplate || !userProperties.email) {
    return false;
  }

  const render = (template: string) =>
    renderWithUserProperties({ userProperties, template });

  const to = userProperties.email;
  const from = escapeHTML(render(emailTemplate.from));
  const subject = escapeHTML(render(emailTemplate.subject));
  const body = render(emailTemplate.body);

  await trackInternalEvents({
    workspaceId,
    events: [
      {
        event: InternalEventType.MessageSent,
        messageId,
        properties: {
          runId,
          messageType: MessageNodeVariantType.Email,
          emailProvider:
            defaultEmailProvider?.emailProvider.type ?? EmailProviderType.Test,
          nodeId,
          userId,
          to,
          from,
          subject,
          body,
          workspaceId,
          templateId,
        },
      },
    ],
  });

  if (!defaultEmailProvider) {
    return false;
  }

  switch (defaultEmailProvider.emailProvider.type) {
    case EmailProviderType.Sendgrid: {
      await sendEmailSendgrid({
        mailData: {
          to,
          from,
          subject,
          html: body,
        },
        apiKey: defaultEmailProvider.emailProvider.apiKey,
      });
      break;
    }
  }
  return true;
}

export async function isRunnable({
  userId,
  journeyId,
}: {
  journeyId: string;
  userId: string;
}): Promise<boolean> {
  const previousExitEvent = await prisma.userJourneyEvent.findFirst({
    where: {
      journeyId,
      userId,
      type: JourneyNodeType.ExitNode,
    },
  });
  return previousExitEvent === null;
}

export async function onNodeProcessed({
  journeyStartedAt,
  userId,
  node,
  journeyId,
}: {
  journeyStartedAt: number;
  journeyId: string;
  userId: string;
  node: JourneyNode;
}) {
  const journeyStartedAtDate = new Date(journeyStartedAt);
  await prisma.userJourneyEvent.upsert({
    where: {
      journeyId_userId_type_journeyStartedAt: {
        journeyStartedAt: journeyStartedAtDate,
        journeyId,
        userId,
        type: node.type,
      },
    },
    update: {},
    create: {
      journeyStartedAt: journeyStartedAtDate,
      journeyId,
      userId,
      type: node.type,
    },
  });
}

export type OnNodeProcessed = typeof onNodeProcessed;

export function getSegmentAssignment({
  segmentId,
  userId,
}: {
  segmentId: string;
  userId: string;
}): Promise<SegmentAssignment | null> {
  return prisma.segmentAssignment.findUnique({
    where: {
      userId_segmentId: {
        segmentId,
        userId,
      },
    },
  });
}