import {
  Client,
  Collection,
  Interaction,
  ChatInputCommandInteraction,  // Import ChatInputCommandInteraction
  SlashCommandBuilder,
  REST,
  Routes,
  ButtonInteraction,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
}

export class CommandHandler {
  private commands: Collection<string, Command>;

  constructor(private client: Client) {
    this.commands = new Collection();
    this.loadCommands();
  }

  // Load command files dynamically from the commands directory
  private loadCommands(): void {
    const commandsPath = path.join(__dirname, 'modules', 'commands');
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const commandModule = require(filePath);
      const command: Command = commandModule;

      if (command.data) {
        this.commands.set(command.data.name, command);
      } else {
        console.warn(
          `[WARNING] The command at ${filePath} is missing 'data' or 'execute'`
        );
      }
    }
  }

  // Register commands to the guild specified in your .env file
  public async registerCommands(): Promise<void> {
    const guildId = process.env.GUILD_ID;
    const token = process.env.DISCORD_TOKEN;
    const clientId = this.client.user?.id;

    if (!guildId || !token || !clientId) {
      console.error('Missing environment variables for command registration');
      return;
    }

    const commandsData = this.commands.map(command => command.data.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);

    try {
      console.log(
        `Started refreshing ${commandsData.length} application (/) commands.`
      );

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandsData,
      });

      console.log(
        `Successfully reloaded ${commandsData.length} application (/) commands.`
      );
    } catch (error) {
      console.error(error);
    }
  }

  // Handle interaction events
  public async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      const command = this.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        await interaction.reply({
          content: 'Command not found.',
          ephemeral: true,
        });
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'There was an error executing that command.',
          ephemeral: true,
        });
      }
    } else if (interaction.isButton()) {
      await this.handleButtonInteraction(interaction as ButtonInteraction);
    }
    // Handle other interaction types if needed
  }

  // Handle button interactions
  public async handleButtonInteraction(
    interaction: ButtonInteraction
  ): Promise<void> {
    const customId = interaction.customId;

    // Determine the command based on the customId prefix
    let commandName: string | undefined;

    if (customId.startsWith('treasure_')) {
      commandName = 'treasure';
    } else if (customId.startsWith('imageGen_')) {
      commandName = 'imagine'; // Ensure this matches the command's registered name
    } else if (customId.startsWith('randomGen_')) {
      commandName = 'random';  // Ensure this matches the command's registered name
    }

    if (commandName) {
      const command = this.commands.get(commandName);
      if (command && command.handleButtonInteraction) {
        await command.handleButtonInteraction(interaction);
      } else {
        console.warn(`No handler for button interaction in command: ${commandName}`);
        await interaction.reply({
          content: 'This button is not supported.',
          ephemeral: true,
        });
      }
    } else {
      console.warn(`Unhandled button interaction: ${customId}`);
      await interaction.reply({
        content: 'This button is not recognized.',
        ephemeral: true,
      });
    }
  }
}
